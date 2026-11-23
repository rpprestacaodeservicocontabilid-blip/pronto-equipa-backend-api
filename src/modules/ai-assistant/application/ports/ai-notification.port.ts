export interface AiNotificationInput {
  tenantId: number | null;
  recipients: number[];
  template: string;
  variables: Record<string, unknown>;
  idempotencyKey: string;
}

/**
 * Porta de notificações (RF-AI-068 — alertas de consumo,
 * aprovações pendentes).
 */
export interface AiNotificationPort {
  notify(input: AiNotificationInput): Promise<void>;
}
