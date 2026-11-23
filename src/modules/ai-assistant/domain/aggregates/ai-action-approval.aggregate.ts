import { createHash, randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { AiDomainEvent, AI_EVENTS } from '../events/ai-domain.event';
import {
  AiArgumentsMismatchError,
  AiInvalidTransitionError,
  AiValidationError,
} from '../errors/ai-domain.error';
import { AiActionRisk } from '../value-objects/ai-action-risk.vo';
import { AiApprovalStatus } from '../value-objects/ai-approval-status.vo';
import { AiToolName } from '../value-objects/ai-tool-name.vo';
import { AiToolVersion } from '../value-objects/ai-tool-version.vo';

export interface AiActionApprovalProps {
  id: string;
  tenantId: number;
  interactionId: string;
  conversationId: string;
  proposedBy: number;
  toolName: string;
  toolVersion: string;
  argumentsJson: Record<string, unknown>;
  actionHash: string;
  riskLevel: string;
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  status: string;
  confirmedBy: number | null;
  confirmedAt: Date | null;
  approvedBy: number | null;
  approvedAt: Date | null;
  rejectedBy: number | null;
  rejectedAt: Date | null;
  decisionReason: string | null;
  expiresAt: Date;
  executedAt: Date | null;
  executionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProposeAiActionInput {
  tenantId: number;
  interactionId: string;
  conversationId: string;
  proposedBy: number;
  toolName: string;
  toolVersion: string;
  arguments: Record<string, unknown>;
  riskLevel: string;
  requiresConfirmation?: boolean;
  requiresApproval?: boolean;
  ttlMinutes?: number;
  id?: string;
  now?: Date;
}

const DEFAULT_TTL_MINUTES = 60;
const MAX_TTL_MINUTES = 24 * 60;

/**
 * Proposta de acção e aprovação humana (secção 9.1, secção 20.2).
 *
 * Invariantes:
 *  - os argumentos são imutáveis a partir da proposta;
 *  - a aprovação fica vinculada ao `actionHash` dos argumentos
 *    (CA-AI-016);
 *  - a confirmação humana é registada pela aplicação, nunca inferida
 *    de uma frase gerada pelo modelo (secção 20.2);
 *  - um aprovador independente é exigido para risco HIGH/CRITICAL;
 *  - propostas expiradas não são executáveis.
 */
export class AiActionApproval extends AggregateRoot<AiActionApprovalProps> {
  private constructor(props: AiActionApprovalProps) {
    super(props);
  }

  static propose(input: ProposeAiActionInput): AiActionApproval {
    if (!Number.isSafeInteger(input.tenantId) || input.tenantId <= 0)
      throw new AiValidationError('Contexto de empresa inválido.');
    if (!Number.isSafeInteger(input.proposedBy) || input.proposedBy <= 0)
      throw new AiValidationError('Utilizador proponente obrigatório.');

    const name = AiToolName.create(input.toolName);
    const version = AiToolVersion.create(input.toolVersion);
    const risk = AiActionRisk.from(input.riskLevel);
    const now = input.now ?? new Date();

    const ttl = Math.min(Math.max(input.ttlMinutes ?? DEFAULT_TTL_MINUTES, 1), MAX_TTL_MINUTES);
    const id = input.id ?? randomUUID();
    const args = input.arguments ?? {};
    const actionHash = AiActionApproval.computeHash(name.value, version.toString(), args);

    const proposal = new AiActionApproval({
      id,
      tenantId: input.tenantId,
      interactionId: input.interactionId,
      conversationId: input.conversationId,
      proposedBy: input.proposedBy,
      toolName: name.value,
      toolVersion: version.toString(),
      argumentsJson: args,
      actionHash,
      riskLevel: risk.value,
      requiresConfirmation: input.requiresConfirmation ?? risk.requiresConfirmation,
      requiresApproval: input.requiresApproval ?? risk.requiresApproval,
      status: 'PROPOSED',
      confirmedBy: null,
      confirmedAt: null,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      decisionReason: null,
      expiresAt: new Date(now.getTime() + ttl * 60_000),
      executedAt: null,
      executionId: null,
      createdAt: now,
      updatedAt: now,
    });

    proposal.record(
      new AiDomainEvent({
        eventName: AI_EVENTS.ACTION_PROPOSED,
        aggregateId: id,
        companyId: input.tenantId,
        userId: input.proposedBy,
        payload: {
          proposalId: id,
          toolName: name.value,
          riskLevel: risk.value,
          actionHash,
        },
        occurredAt: now,
      }),
    );

    return proposal;
  }

  /** Hash estável dos argumentos — base da vinculação da aprovação. */
  static computeHash(
    toolName: string,
    toolVersion: string,
    args: Record<string, unknown>,
  ): string {
    const canonical = JSON.stringify(
      { toolName, toolVersion, args },
      (_key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.keys(value as Record<string, unknown>)
              .sort()
              .reduce<Record<string, unknown>>((acc, key) => {
                acc[key] = (value as Record<string, unknown>)[key];
                return acc;
              }, {})
          : value,
    );
    return createHash('sha256').update(canonical).digest('hex');
  }

  static restore(props: AiActionApprovalProps): AiActionApproval {
    return new AiActionApproval({ ...props, argumentsJson: { ...props.argumentsJson } });
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): number {
    return this.props.tenantId;
  }

  get interactionId(): string {
    return this.props.interactionId;
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get proposedBy(): number {
    return this.props.proposedBy;
  }

  get confirmedBy(): number | null {
    return this.props.confirmedBy;
  }

  get approvedBy(): number | null {
    return this.props.approvedBy;
  }

  get rejectedBy(): number | null {
    return this.props.rejectedBy;
  }

  get decisionReason(): string | null {
    return this.props.decisionReason;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get toolName(): string {
    return this.props.toolName;
  }

  get toolVersion(): string {
    return this.props.toolVersion;
  }

  get argumentsJson(): Record<string, unknown> {
    return { ...this.props.argumentsJson };
  }

  get actionHash(): string {
    return this.props.actionHash;
  }

  get riskLevel(): string {
    return this.props.riskLevel;
  }

  get status(): string {
    return this.props.status;
  }

  get requiresConfirmation(): boolean {
    return this.props.requiresConfirmation;
  }

  get requiresApproval(): boolean {
    return this.props.requiresApproval;
  }

  get decidedBy(): number | null {
    return this.props.approvedBy ?? this.props.rejectedBy ?? this.props.confirmedBy;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get executionId(): string | null {
    return this.props.executionId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Confirmação do solicitante (RF-AI-047). */
  confirm(actorId: number, now = new Date()): AiActionApprovalProps {
    this.assertNotExpired(now);
    this.transition('CONFIRMED', now);
    this.props.confirmedBy = actorId;
    this.props.confirmedAt = now;
    this.record(
      new AiDomainEvent({
        eventName: AI_EVENTS.ACTION_CONFIRMED,
        aggregateId: this.props.id,
        companyId: this.props.tenantId,
        userId: actorId,
        payload: { proposalId: this.props.id },
        occurredAt: now,
      }),
    );
    return this.propsSnapshot;
  }

  /**
   * Aprovação por aprovador independente (RF-AI-048, secção 20.2).
   *
   * CA-AI-015: o aprovador não pode ser o proponente quando a acção
   * exige separação de tarefas (HIGH/CRITICAL).
   */
  approve(actorId: number, now = new Date()): AiActionApprovalProps {
    this.assertNotExpired(now);
    const risk = AiActionRisk.from(this.props.riskLevel);
    if (risk.requiresApproval && actorId === this.props.proposedBy)
      throw new AiValidationError('A aprovação exige um aprovador independente do proponente.');
    if (this.props.requiresConfirmation && !this.props.confirmedBy)
      throw new AiValidationError('A acção requer confirmação prévia do solicitante.');
    this.transition('APPROVED', now);
    this.props.approvedBy = actorId;
    this.props.approvedAt = now;
    this.record(
      new AiDomainEvent({
        eventName: AI_EVENTS.ACTION_APPROVED,
        aggregateId: this.props.id,
        companyId: this.props.tenantId,
        userId: actorId,
        payload: { proposalId: this.props.id, actionHash: this.props.actionHash },
        occurredAt: now,
      }),
    );
    return this.propsSnapshot;
  }

  reject(actorId: number, reason: string, now = new Date()): AiActionApprovalProps {
    const normalized = String(reason ?? '').trim();
    if (normalized.length < 3) throw new AiValidationError('Indique o motivo da recusa.');
    this.transition('REJECTED', now);
    this.props.rejectedBy = actorId;
    this.props.rejectedAt = now;
    this.props.decisionReason = normalized.slice(0, 500);
    this.record(
      new AiDomainEvent({
        eventName: AI_EVENTS.ACTION_REJECTED,
        aggregateId: this.props.id,
        companyId: this.props.tenantId,
        userId: actorId,
        payload: { proposalId: this.props.id, reason: this.props.decisionReason },
        occurredAt: now,
      }),
    );
    return this.propsSnapshot;
  }

  cancel(actorId: number, now = new Date()): AiActionApprovalProps {
    this.transition('CANCELLED', now);
    this.props.decisionReason = 'Cancelada pelo utilizador.';
    this.props.updatedAt = now;
    return this.propsSnapshot;
  }

  expire(now = new Date()): AiActionApprovalProps {
    if (this.props.status === 'PROPOSED' || this.props.status === 'CONFIRMED') {
      this.transition('EXPIRED', now);
      this.props.decisionReason = 'Proposta expirada.';
    }
    return this.propsSnapshot;
  }

  /**
   * Marca a execução concluída, revalidando o vínculo com os
   * argumentos aprovados (CA-AI-016).
   */
  markExecuted(executionId: string, args: Record<string, unknown>, now = new Date()): AiActionApprovalProps {
    if (!AiApprovalStatus.from(this.props.status).isExecutable)
      throw new AiInvalidTransitionError(this.props.status, 'EXECUTED');
    if (this.isExpired(now))
      throw new AiValidationError('A proposta expirou antes da execução.');
    const expected = AiActionApproval.computeHash(
      this.props.toolName,
      this.props.toolVersion,
      args,
    );
    if (expected !== this.props.actionHash)
      throw new AiArgumentsMismatchError('Os argumentos não correspondem aos aprovados.');
    this.transition('EXECUTED', now);
    this.props.executionId = executionId;
    this.props.executedAt = now;
    this.record(
      new AiDomainEvent({
        eventName: AI_EVENTS.ACTION_EXECUTED,
        aggregateId: this.props.id,
        companyId: this.props.tenantId,
        userId: this.props.approvedBy ?? this.props.confirmedBy ?? this.props.proposedBy,
        payload: { proposalId: this.props.id, executionId },
        occurredAt: now,
      }),
    );
    return this.propsSnapshot;
  }

  isExpired(now = new Date()): boolean {
    return this.props.expiresAt.getTime() <= now.getTime();
  }

  private assertNotExpired(now: Date): void {
    if (this.isExpired(now)) {
      this.expire(now);
      throw new AiValidationError('A proposta de acção expirou.');
    }
  }

  private transition(to: string, now: Date): void {
    const current = AiApprovalStatus.from(this.props.status);
    const next = AiApprovalStatus.from(to);
    if (!current.canTransitionTo(next))
      throw new AiInvalidTransitionError(current.value, next.value);
    this.props.status = next.value;
    this.props.updatedAt = now;
  }

  public get propsSnapshot(): AiActionApprovalProps {
    return { ...this.props, argumentsJson: { ...this.props.argumentsJson } };
  }
}
