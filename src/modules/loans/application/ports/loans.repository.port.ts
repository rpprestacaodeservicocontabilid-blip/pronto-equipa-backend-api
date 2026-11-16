type LoanType = 'LOAN' | 'SALARY_ADVANCE' | 'EXTRAORDINARY_ADVANCE';
type Frequency = 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY';
type ApplicationInput = {
  employeeId: string;
  loanType: LoanType;
  requestedAmount: string;
  currency: string;
  installmentCount: number;
  frequency: Frequency;
  firstDueDate: string;
  annualInterestBps?: number;
  reason: string;
};
type PolicyInput = {
  code: string;
  effectiveFrom: string;
  maxAmount: string;
  maxInstallments: number;
  maxActiveLoans: number;
  allowedTypes: LoanType[];
  interestAllowed: boolean;
  maxAnnualInterestBps: number;
  deductionAuthorizationRequired: boolean;
};
/** Operation inputs and opaque read results; no ORM types cross this boundary. */
export interface LoansRepositoryPort {
  createApplication(
    companyId: number,
    actorUserId: number,
    input: ApplicationInput,
  ): Promise<object>;
  updateApplication(
    companyId: number,
    id: string,
    input: Partial<ApplicationInput>,
  ): Promise<object>;
  submitApplication(companyId: number, id: string): Promise<object>;
  decideApplication(
    companyId: number,
    actorUserId: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    comments?: string,
  ): Promise<object>;
  cancelApplication(companyId: number, id: string, actorUserId: number): Promise<object>;
  getApplication(companyId: number, id: string): Promise<object>;
  listApplications(
    companyId: number,
    query: {
      employeeId?: string;
      status?: string;
      page: number;
      limit: number;
    },
  ): Promise<object>;
  listLoans(
    companyId: number,
    query: {
      employeeId?: string;
      status?: string;
      page: number;
      limit: number;
    },
  ): Promise<object>;
  getLoan(companyId: number, id: string): Promise<object>;
  getBalance(companyId: number, id: string): Promise<object>;
  listPlans(companyId: number, loanId: string): Promise<object>;
  listInstallments(companyId: number, loanId: string): Promise<object>;
  requestDisbursement(
    companyId: number,
    actorUserId: number,
    loanId: string,
    input: {
      paymentReference?: string;
      idempotencyKey: string;
    },
  ): Promise<object>;
  confirmDisbursement(
    companyId: number,
    actorUserId: number,
    loanId: string,
    disbursementId: string,
    paymentReference: string,
  ): Promise<object>;
  listDisbursements(companyId: number, loanId: string): Promise<object>;
  registerRepayment(
    companyId: number,
    actorUserId: number,
    loanId: string,
    input: {
      amount: string;
      source: string;
      externalReference: string;
      idempotencyKey: string;
    },
  ): Promise<object>;
  listRepayments(companyId: number, loanId: string): Promise<object>;
  reverseRepayment(
    companyId: number,
    actorUserId: number,
    loanId: string,
    repaymentId: string,
    reversalReference: string,
  ): Promise<object>;
  requestDeductions(
    companyId: number,
    loanId: string,
    actorUserId: number,
    idempotencyKey: string,
  ): Promise<object>;
  confirmDeduction(
    companyId: number,
    actorUserId: number,
    id: string,
    input: {
      payrollRunId: string;
      confirmedAmount: string;
      idempotencyKey: string;
    },
  ): Promise<object>;
  listDeductions(
    companyId: number,
    query: {
      loanId?: string;
      status?: string;
      page: number;
      limit: number;
    },
  ): Promise<object>;
  requestRenegotiation(
    companyId: number,
    actorUserId: number,
    loanId: string,
    input: {
      installmentCount: number;
      firstDueDate: string;
      frequency: Frequency;
      reason: string;
    },
  ): Promise<object>;
  decideRenegotiation(
    companyId: number,
    actorUserId: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
  ): Promise<object>;
  setLoanStatus(
    companyId: number,
    actorUserId: number,
    id: string,
    action: 'SUSPEND' | 'RESUME',
  ): Promise<object>;
  settleLoan(companyId: number, actorUserId: number, id: string): Promise<object>;
  listPolicies(companyId: number): Promise<object>;
  createPolicy(companyId: number, actorUserId: number, input: PolicyInput): Promise<object>;
  simulate(
    companyId: number,
    input: {
      requestedAmount: string;
      currency: string;
      installmentCount: number;
      firstDueDate: string;
      frequency: Frequency;
      loanType?: LoanType;
      annualInterestBps?: number;
    },
  ): Promise<object>;
  summary(companyId: number): Promise<object>;
  outstandingReport(
    companyId: number,
    query: {
      page: number;
      limit: number;
    },
  ): Promise<object>;
  history(companyId: number, loanId: string): Promise<object>;
  listLateInstallments(
    companyId: number,
    query: {
      page: number;
      limit: number;
    },
  ): Promise<object>;
}
