import { AppError } from '../../../shared/errors/app.error';

export const fail = (message: string, statusCode = 422) =>
  new AppError(message, statusCode, 'ONBOARDING_RULE_VIOLATION');
export const editable = ['DRAFT', 'IN_PROGRESS', 'ADDITIONAL_INFO', 'REJECTED'];
export interface OnboardingPorts {
  verifiedUser(actor: number): Promise<boolean>;
  provision(input: {
    applicationId: string;
    actor: number;
    company: any;
    settings: any;
  }): Promise<number>;
  activate(companyId: number, applicationId: string): Promise<void>;
  plans(): Promise<any>;
  subscribe(companyId: number, actor: number, plan: any, key: string): Promise<any>;
  subscription(companyId: number): Promise<any>;
  billingAccount(companyId: number, actor: number, company: any): Promise<any>;
  validateLegal(id: string): Promise<boolean>;
  configureOrganization(companyId: number, actor: number, configuration: any): Promise<void>;
  configurePayroll(companyId: number, actor: number, configuration: any): Promise<void>;
}

