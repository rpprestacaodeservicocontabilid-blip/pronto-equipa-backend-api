import { RecordStorePort } from '../../../../shared/application/ports/record-store.port';
export interface OnboardingApplicationView {
  id: string;
  ownerId: number;
  operationKey: string;
  status: string;
  companyId: number | null;
  version: number;
  data: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}
export interface OnboardingResourceView {
  id: string;
  applicationId: string;
  kind: string;
  key: string;
  status: string;
  data: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}
export interface OnboardingEventView {
  id: string;
  applicationId: string;
  data: Record<string, any>;
  createdAt?: Date;
}
export interface WorkflowPolicy {
  version: number;
  requiredDocuments: number;
  invitationHours: number;
  inactivityDays: number;
  companyVerificationModes?: string[];
  organizationRequiredModes?: string[];
}
export const provisionSteps = ['tenant', 'organization', 'payroll-settings', 'billing-account', 'subscription', 'activation'] as const;
export type ProvisionStep = typeof provisionSteps[number];
export interface ProvisionCheckpoint {
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  attempts: number;
  updatedAt: string;
}
export interface OnboardingPolicyView {
  id: string;
  version: number;
  actorId: number;
  reason: string;
  data: Omit<WorkflowPolicy, 'version'>;
  createdAt?: Date;
}
export interface OnboardingPersistencePort {
  policies: RecordStorePort<OnboardingPolicyView>;
  applications: RecordStorePort<OnboardingApplicationView>;
  resources: RecordStorePort<OnboardingResourceView>;
  events: RecordStorePort<OnboardingEventView>;
}

