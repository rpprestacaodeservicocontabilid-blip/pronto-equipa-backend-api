/**
 * Porta de entitlement da subscrição (RF-AI-069, RN-AI-026,
 * secção 21.2).
 *
 * O módulo `subscriptions/` define a disponibilidade da IA e os
 * limites contratados; este módulo mede e aplica-os.
 */
export interface AiEntitlementCheck {
  allowed: boolean;
  reason?: string;
  entitlementVersion: string;
}

export interface AiEntitlementLimit {
  limit: string | null;
  used: string;
  reserved: string;
  resetAt?: string;
}

export interface AiUsageReservationResult {
  reservationId: string | null;
  allowed: boolean;
  reason?: string;
}

export interface AiEntitlementPort {
  isAiEnabled(tenantId: number): Promise<AiEntitlementCheck>;
  getMonthlyMessageLimit(tenantId: number): Promise<AiEntitlementLimit>;
  reserve(tenantId: number, quantity: number, operationKey: string): Promise<AiUsageReservationResult>;
  commit(tenantId: number, reservationId: string): Promise<void>;
  release(tenantId: number, reservationId: string): Promise<void>;
}
