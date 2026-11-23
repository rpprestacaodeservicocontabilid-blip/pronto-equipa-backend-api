import { createHash, randomUUID } from 'crypto';
import { AiValidationError } from '../errors/ai-domain.error';

export interface CreateAiContextSnapshotInput {
  tenantId: number;
  interactionId: string;
  policyVersion: string;
  permissions: string[];
  knowledgeSourceIds: string[];
  redactedFields: string[];
  toolNames: string[];
  id?: string;
  now?: Date;
}

/**
 * Registo do contexto autorizado construído para uma interacção
 * (RF-AI-014, RF-AI-015).
 *
 * Permite provar, em auditoria, que permissões e fontes foram
 * aplicadas ANTES de o conteúdo chegar ao modelo, e revalida o
 * contexto quando permissões mudam (RF-AI-019).
 */
export class AiContextSnapshot {
  readonly id: string;
  readonly tenantId: number;
  readonly interactionId: string;
  readonly contextHash: string;
  readonly policyVersion: string;
  readonly permissions: readonly string[];
  readonly knowledgeSourceIds: readonly string[];
  readonly redactedFields: readonly string[];
  readonly toolNames: readonly string[];
  readonly createdAt: Date;

  private constructor(
    input: CreateAiContextSnapshotInput & { contextHash: string; createdAt: Date },
  ) {
    this.id = input.id ?? randomUUID();
    this.tenantId = input.tenantId;
    this.interactionId = input.interactionId;
    this.contextHash = input.contextHash;
    this.policyVersion = input.policyVersion;
    this.permissions = Object.freeze([...input.permissions]);
    this.knowledgeSourceIds = Object.freeze([...input.knowledgeSourceIds]);
    this.redactedFields = Object.freeze([...input.redactedFields]);
    this.toolNames = Object.freeze([...input.toolNames]);
    this.createdAt = input.createdAt;
  }

  static create(input: CreateAiContextSnapshotInput): AiContextSnapshot {
    if (!Number.isSafeInteger(input.tenantId) || input.tenantId <= 0)
      throw new AiValidationError('Contexto de empresa inválido.');
    if (!input.interactionId) throw new AiValidationError('Interação obrigatória.');
    if (!input.policyVersion) throw new AiValidationError('Versão de política obrigatória.');

    const canonical = JSON.stringify({
      tenantId: input.tenantId,
      permissions: [...input.permissions].sort(),
      sources: [...input.knowledgeSourceIds].sort(),
      tools: [...input.toolNames].sort(),
      policyVersion: input.policyVersion,
    });

    return new AiContextSnapshot({
      ...input,
      contextHash: createHash('sha256').update(canonical).digest('hex'),
      createdAt: input.now ?? new Date(),
    });
  }

  static restore(
    props: CreateAiContextSnapshotInput & { contextHash: string; createdAt?: Date },
  ): AiContextSnapshot {
    return new AiContextSnapshot({ ...props, createdAt: props.createdAt ?? new Date() });
  }

  /** O snapshot corresponde ao conjunto actual de permissões? */
  matchesPermissions(permissions: readonly string[]): boolean {
    const current = [...permissions].sort().join('|');
    const snapshot = [...this.permissions].sort().join('|');
    return current === snapshot;
  }
}
