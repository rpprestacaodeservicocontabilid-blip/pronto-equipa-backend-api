/**
 * Porta de auditoria do assistente (RF-AI-020, RF-AI-050, RF-AI-074,
 * RN-AI-024).
 *
 * As operações sensíveis (acesso a dados salariais, execução de
 * ferramentas, decisões de aprovação) são registadas de forma
 * verificável. Falhas de auditoria nunca perdem a operação concluída.
 */
export type AiAuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILURE';

export interface AiAuditRecordInput {
  tenantId: number | null;
  actorId: number | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome?: AiAuditOutcome;
  correlationId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface AiAuditPort {
  record(input: AiAuditRecordInput): Promise<void>;
}
