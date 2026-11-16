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
export interface OnboardingPersistencePort {
  applications: RecordStorePort<OnboardingApplicationView>;
  resources: RecordStorePort<OnboardingResourceView>;
  events: RecordStorePort<OnboardingEventView>;
}
