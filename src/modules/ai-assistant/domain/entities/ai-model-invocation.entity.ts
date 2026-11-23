import { randomUUID } from 'crypto';
import { AiValidationError } from '../errors/ai-domain.error';

export interface CreateAiModelInvocationInput {
  tenantId: number;
  interactionId: string;
  providerId: string;
  modelId: string;
  promptCode?: string | null;
  promptVersion?: number | null;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostAmount?: number;
  estimatedCostCurrency?: string;
  latencyMs?: number;
  fallbackUsed?: boolean;
  /** Estado final da chamada quando já concluída. */
  status?: string;
  id?: string;
  now?: Date;
}

/**
 * Invocação concreta a um fornecedor de IA (RF-AI-051/052/060).
 *
 * Regista a versão efectivamente utilizada para permitir auditoria e
 * reprodutibilidade das respostas (RN-AI-013).
 */
export class AiModelInvocation {
  readonly id: string;
  readonly tenantId: number;
  readonly interactionId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly promptCode: string | null;
  readonly promptVersion: number | null;
  readonly status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'TIMEOUT' | 'FALLBACK';
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostAmount: number;
  readonly estimatedCostCurrency: string;
  readonly latencyMs: number;
  readonly fallbackUsed: boolean;
  readonly errorCode: string | null;
  readonly createdAt: Date;

  private constructor(
    input: CreateAiModelInvocationInput & {
      status: AiModelInvocation['status'];
      errorCode: string | null;
      createdAt: Date;
    },
  ) {
    this.id = input.id ?? randomUUID();
    this.tenantId = input.tenantId;
    this.interactionId = input.interactionId;
    this.providerId = input.providerId;
    this.modelId = input.modelId;
    this.promptCode = input.promptCode ?? null;
    this.promptVersion = input.promptVersion ?? null;
    this.status = input.status;
    this.inputTokens = input.inputTokens ?? 0;
    this.outputTokens = input.outputTokens ?? 0;
    this.estimatedCostAmount = input.estimatedCostAmount ?? 0;
    this.estimatedCostCurrency = input.estimatedCostCurrency ?? 'AOA';
    this.latencyMs = input.latencyMs ?? 0;
    this.fallbackUsed = input.fallbackUsed ?? false;
    this.errorCode = input.errorCode;
    this.createdAt = input.createdAt;
  }

  static create(input: CreateAiModelInvocationInput): AiModelInvocation {
    if (!Number.isSafeInteger(input.tenantId) || input.tenantId <= 0)
      throw new AiValidationError('Contexto de empresa inválido.');
    if (!input.interactionId) throw new AiValidationError('Interação obrigatória.');
    if (!input.providerId || !input.modelId)
      throw new AiValidationError('Fornecedor e modelo obrigatórios.');

    const status = String(input.status ?? 'PENDING').trim().toUpperCase();
    if (!['PENDING', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'FALLBACK'].includes(status))
      throw new AiValidationError(`Estado de invocação inválido: ${status}.`);

    return new AiModelInvocation({
      ...input,
      status: status as AiModelInvocation['status'],
      errorCode: null,
      createdAt: input.now ?? new Date(),
    });
  }

  static restore(
    props: CreateAiModelInvocationInput & {
      status: AiModelInvocation['status'];
      errorCode?: string | null;
      createdAt?: Date;
    },
  ): AiModelInvocation {
    return new AiModelInvocation({
      ...props,
      status: props.status,
      errorCode: props.errorCode ?? null,
      createdAt: props.createdAt ?? new Date(),
    });
  }
}
