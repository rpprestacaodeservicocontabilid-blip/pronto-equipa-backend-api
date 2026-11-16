import {
  RecordStorePort,
  RecordStoreContext,
} from '../../../../shared/application/ports/record-store.port';
export interface SubscriptionRecord {
  id: string;
  companyId: number | null;
  status: string;
  runId: string | null;
  employeeId: string | null;
  key: string;
  version: number;
  data: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
export type SubscriptionCollection =
  | 'subscriptionPlan'
  | 'subscriptionPlanVersion'
  | 'subscriptionPlanPrice'
  | 'subscriptionFeature'
  | 'subscriptionPlanFeature'
  | 'subscriptionPlanLimit'
  | 'tenantSubscription'
  | 'subscriptionPeriod'
  | 'subscriptionTrial'
  | 'subscriptionEntitlement'
  | 'subscriptionOverride'
  | 'subscriptionChangeRequest'
  | 'subscriptionUsageAccount'
  | 'subscriptionUsageReservation'
  | 'subscriptionUsageRecord'
  | 'subscriptionTransition'
  | 'subscriptionApproval'
  | 'subscriptionNotification'
  | 'subscriptionPolicy'
  | 'subscriptionOutbox';
export interface SubscriptionPersistencePort {
  collections: Record<SubscriptionCollection, RecordStorePort<SubscriptionRecord>>;
  update(
    record: SubscriptionRecord,
    changes: Partial<SubscriptionRecord>,
    options?: { transaction?: RecordStoreContext },
  ): Promise<SubscriptionRecord>;
  latestPlanVersion(planId: string, context: RecordStoreContext): Promise<number>;
  companyIds(): Promise<Array<{ id: number }>>;
}
