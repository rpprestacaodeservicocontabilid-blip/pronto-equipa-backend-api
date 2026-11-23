import { createHash, randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { AiDomainEvent, AI_EVENTS } from '../events/ai-domain.event';
import { AiValidationError } from '../errors/ai-domain.error';
import { AiToolName } from '../value-objects/ai-tool-name.vo';
import { AiToolVersion } from '../value-objects/ai-tool-version.vo';

export type AiToolExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'DENIED'
  | 'BLOCKED';

export interface AiToolExecutionProps {
  id: string;
  tenantId: number;
  interactionId: string | null;
  toolName: string;
  toolVersion: string;
  status: AiToolExecutionStatus;
  argumentsHash: string;
  idempotencyKey: string;
  resultReference: string | null;
  failureReason: string | null;
  executedBy: number;
  startedAt: Date;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StartAiToolExecutionInput {
  tenantId: number;
  interactionId: string | null;
  toolName: string;
  toolVersion: string;
  arguments: Record<string, unknown>;
  idempotencyKey: string;
  executedBy: number;
  id?: string;
  now?: Date;
}

/**
 * Execução controlada de uma ferramenta (secção 9.1, RF-AI-045/050).
 *
 * Invariantes:
 *  - toda a execução está associada a uma interacção ou a um actor
 *    explícito e auditável;
 *  - os argumentos são resumidos por hash para detetar alterações
 *    depois de aprovados (CA-AI-016);
 *  - execuções terminais não mudam de estado.
 */
export class AiToolExecution extends AggregateRoot<AiToolExecutionProps> {
  private constructor(props: AiToolExecutionProps) {
    super(props);
  }

  static start(input: StartAiToolExecutionInput): AiToolExecution {
    if (!Number.isSafeInteger(input.tenantId) || input.tenantId <= 0)
      throw new AiValidationError('Contexto de empresa inválido.');
    if (!Number.isSafeInteger(input.executedBy) || input.executedBy <= 0)
      throw new AiValidationError('Actor da execução obrigatório.');

    const name = AiToolName.create(input.toolName);
    const version = AiToolVersion.create(input.toolVersion);
    const now = input.now ?? new Date();
    const id = input.id ?? randomUUID();

    const execution = new AiToolExecution({
      id,
      tenantId: input.tenantId,
      interactionId: input.interactionId,
      toolName: name.value,
      toolVersion: version.toString(),
      status: 'PENDING',
      argumentsHash: AiToolExecution.hashArguments(name.value, version.toString(), input.arguments),
      idempotencyKey: String(input.idempotencyKey ?? '').slice(0, 160),
      resultReference: null,
      failureReason: null,
      executedBy: input.executedBy,
      startedAt: now,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    execution.record(
      new AiDomainEvent({
        eventName: AI_EVENTS.TOOL_EXECUTION_REQUESTED,
        aggregateId: id,
        companyId: input.tenantId,
        userId: input.executedBy,
        payload: { executionId: id, toolName: name.value, toolVersion: version.toString() },
        occurredAt: now,
      }),
    );

    return execution;
  }

  /** Resumo determinístico dos argumentos (SHA-256). */
  static hashArguments(
    toolName: string,
    toolVersion: string,
    args: Record<string, unknown>,
  ): string {
    const canonical = JSON.stringify({ toolName, toolVersion, args: AiToolExecution.sort(args) });
    return createHash('sha256').update(canonical).digest('hex');
  }

  private static sort(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => AiToolExecution.sort(item));
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = AiToolExecution.sort((value as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return value;
  }

  static restore(props: AiToolExecutionProps): AiToolExecution {
    return new AiToolExecution({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): number {
    return this.props.tenantId;
  }

  get interactionId(): string | null {
    return this.props.interactionId;
  }

  get toolName(): string {
    return this.props.toolName;
  }

  get toolVersion(): string {
    return this.props.toolVersion;
  }

  get status(): AiToolExecutionStatus {
    return this.props.status;
  }

  get argumentsHash(): string {
    return this.props.argumentsHash;
  }

  get resultReference(): string | null {
    return this.props.resultReference;
  }

  get failureReason(): string | null {
    return this.props.failureReason;
  }

  get startedAt(): Date {
    return this.props.startedAt;
  }

  get finishedAt(): Date | null {
    return this.props.finishedAt;
  }

  get isTerminal(): boolean {
    return ['SUCCESS', 'FAILED', 'DENIED', 'BLOCKED'].includes(this.props.status);
  }

  begin(now = new Date()): AiToolExecutionProps {
    if (this.props.status !== 'PENDING')
      throw new AiValidationError('A execução já foi iniciada.');
    this.props.status = 'RUNNING';
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  succeed(reference: string, now = new Date()): AiToolExecutionProps {
    if (this.isTerminal) return this.propsSnapshot;
    this.props.status = 'SUCCESS';
    this.props.resultReference = String(reference ?? '').slice(0, 400);
    this.props.finishedAt = now;
    this.props.updatedAt = now;
    this.emit(AI_EVENTS.TOOL_EXECUTED, now);
    return this.propsSnapshot;
  }

  fail(reason: string, now = new Date()): AiToolExecutionProps {
    if (this.isTerminal) return this.propsSnapshot;
    this.props.status = 'FAILED';
    this.props.failureReason = String(reason ?? '').slice(0, 500);
    this.props.finishedAt = now;
    this.props.updatedAt = now;
    this.emit(AI_EVENTS.TOOL_FAILED, now);
    return this.propsSnapshot;
  }

  deny(reason: string, now = new Date()): AiToolExecutionProps {
    if (this.isTerminal) return this.propsSnapshot;
    this.props.status = 'DENIED';
    this.props.failureReason = String(reason ?? '').slice(0, 500);
    this.props.finishedAt = now;
    this.props.updatedAt = now;
    this.emit(AI_EVENTS.TOOL_DENIED, now);
    return this.propsSnapshot;
  }

  block(reason: string, now = new Date()): AiToolExecutionProps {
    if (this.isTerminal) return this.propsSnapshot;
    this.props.status = 'BLOCKED';
    this.props.failureReason = String(reason ?? '').slice(0, 500);
    this.props.finishedAt = now;
    this.props.updatedAt = now;
    this.emit(AI_EVENTS.TOOL_DENIED, now);
    return this.propsSnapshot;
  }

  /** Confirma que os argumentos não mudaram desde a aprovação (CA-AI-016). */
  assertArgumentsUnchanged(
    toolName: string,
    toolVersion: string,
    args: Record<string, unknown>,
  ): void {
    if (this.argumentsHash !== AiToolExecution.hashArguments(toolName, toolVersion, args))
      throw new AiValidationError('Os argumentos da acção foram alterados após aprovação.');
  }

  private emit(eventName: (typeof AI_EVENTS)[keyof typeof AI_EVENTS], now: Date): void {
    this.record(
      new AiDomainEvent({
        eventName,
        aggregateId: this.props.id,
        companyId: this.props.tenantId,
        userId: this.props.executedBy,
        payload: {
          executionId: this.props.id,
          toolName: this.props.toolName,
          status: this.props.status,
        },
        occurredAt: now,
      }),
    );
  }

  public get propsSnapshot(): AiToolExecutionProps {
    return { ...this.props };
  }
}
