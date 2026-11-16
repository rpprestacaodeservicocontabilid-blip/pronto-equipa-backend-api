import { EntitlementDecision, SubscriptionLimit } from '../domain/subscription.types';
export interface SubscriptionEntitlementPort {
  checkFeature(input: { tenantId: string; featureCode: string }): Promise<EntitlementDecision>;
  getLimit(input: { tenantId: string; metricCode: string }): Promise<SubscriptionLimit>;
}
export interface SubscriptionUsagePort {
  reserve(input: {
    tenantId: string;
    metricCode: string;
    quantity: string;
    operationKey: string;
  }): Promise<{ reservationId: string | null; allowed: boolean; reason?: string }>;
  commit(input: { tenantId: string; reservationId: string }): Promise<void>;
  release(input: { tenantId: string; reservationId: string }): Promise<void>;
}
