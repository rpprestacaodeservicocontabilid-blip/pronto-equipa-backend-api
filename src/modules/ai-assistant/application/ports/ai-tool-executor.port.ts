/**
 * Porta de execução de ferramentas (secção 12.4, RF-AI-045/049).
 *
 * A implementação resolve identidade e tenant a partir do contexto
 * confiável da aplicação. Os identificadores deste contrato NÃO são
 * aceites como prova de autorização (RN-AI-019).
 */
export interface AiToolExecutorInput {
  toolName: string;
  toolVersion: string;
  arguments: Record<string, unknown>;
  actorId: string;
  tenantId: string;
  interactionId: string;
  idempotencyKey: string;
}

export interface AiToolExecutorResult {
  executionId: string;
  status: 'SUCCESS' | 'FAILED' | 'DENIED' | 'BLOCKED';
  result?: unknown;
  reason?: string;
}

export interface AiToolExecutorPort {
  execute(input: AiToolExecutorInput): Promise<AiToolExecutorResult>;

  /** Consulta o resultado de uma execução concluída. */
  getExecution(
    tenantId: string,
    executionId: string,
  ): Promise<AiToolExecutorResult | null>;
}
