import { Request, Response } from 'express';
import { ManageLoansUseCase } from '../../application/use-cases/manage-loans.use-case';
import {
  ConfirmDisbursementBody,
  CreateApplicationBody,
  DecideApplicationBody,
  DeductionConfirmationBody,
  DeductionRequestBody,
  DisbursementBody,
  LoanStatusActionBody,
  PolicyBody,
  RenegotiationBody,
  RenegotiationDecisionBody,
  RepaymentBody,
  ReversalBody,
  SimulationBody,
  UpdateApplicationBody,
} from '../schemas/loans.schema';

type Context = { companyId: number; actorUserId: number };

export class LoansController {
  constructor(private readonly loans: ManageLoansUseCase) {}

  async createApplication(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      'loans.application.created',
      'loan_application',
      (repository) =>
        repository.createApplication(
          context.companyId,
          context.actorUserId,
          req.body as CreateApplicationBody,
        ),
    );
    res.status(201).json({ success: true, data });
  }

  async updateApplication(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      'loans.application.updated',
      'loan_application',
      (repository) =>
        repository.updateApplication(
          context.companyId,
          req.params.id,
          req.body as UpdateApplicationBody,
        ),
    );
    res.status(200).json({ success: true, data });
  }

  async submitApplication(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      'loans.application.submitted',
      'loan_application',
      (repository) => repository.submitApplication(context.companyId, req.params.id),
    );
    res.status(200).json({ success: true, data });
  }

  async decideApplication(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as DecideApplicationBody;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      `loans.application.${body.decision.toLowerCase()}`,
      'loan_application',
      (repository) =>
        repository.decideApplication(
          context.companyId,
          context.actorUserId,
          req.params.id,
          body.decision,
          body.comments,
        ),
    );
    res.status(200).json({ success: true, data });
  }

  async cancelApplication(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      'loans.application.cancelled',
      'loan_application',
      (repository) =>
        repository.cancelApplication(context.companyId, req.params.id, context.actorUserId),
    );
    res.status(200).json({ success: true, data });
  }

  async getApplication(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.getApplication(companyId, req.params.id),
    );
    res.status(200).json({ success: true, data });
  }

  async listApplications(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.listApplications(companyId, req.query as never),
    );
    res.status(200).json({ success: true, ...data });
  }

  async listLoans(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.listLoans(companyId, req.query as never),
    );
    res.status(200).json({ success: true, ...data });
  }

  async getLoan(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.getLoan(companyId, req.params.id),
    );
    res.status(200).json({ success: true, data });
  }

  async getBalance(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.getBalance(companyId, req.params.id),
    );
    res.status(200).json({ success: true, data });
  }

  async plans(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.listPlans(companyId, req.params.id),
    );
    res.status(200).json({ success: true, data });
  }

  async installments(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.listInstallments(companyId, req.params.id),
    );
    res.status(200).json({ success: true, data });
  }

  async requestDisbursement(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      'loans.disbursement.requested',
      'loan_disbursement',
      (repository) =>
        repository.requestDisbursement(
          context.companyId,
          context.actorUserId,
          req.params.id,
          req.body as DisbursementBody,
        ),
    );
    res.status(201).json({ success: true, data });
  }

  async confirmDisbursement(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      'loans.disbursement.confirmed',
      'employee_loan',
      (repository) =>
        repository.confirmDisbursement(
          context.companyId,
          context.actorUserId,
          req.params.id,
          req.params.disbursementId,
          (req.body as ConfirmDisbursementBody).paymentReference,
        ),
    );
    res.status(200).json({ success: true, data });
  }

  async disbursements(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.listDisbursements(companyId, req.params.id),
    );
    res.status(200).json({ success: true, data });
  }

  async registerRepayment(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      'loans.repayment.confirmed',
      'loan_repayment',
      (repository) =>
        repository.registerRepayment(
          context.companyId,
          context.actorUserId,
          req.params.id,
          req.body as RepaymentBody,
        ),
    );
    res.status(201).json({ success: true, data });
  }

  async repayments(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.listRepayments(companyId, req.params.id),
    );
    res.status(200).json({ success: true, data });
  }

  async reverseRepayment(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      'loans.repayment.reversed',
      'loan_repayment',
      (repository) =>
        repository.reverseRepayment(
          context.companyId,
          context.actorUserId,
          req.params.id,
          req.params.repaymentId,
          (req.body as ReversalBody).reversalReference,
        ),
    );
    res.status(200).json({ success: true, data });
  }

  async requestDeduction(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      'loans.payroll-deduction.requested',
      'loan_payroll_deduction',
      (repository) =>
        repository.requestDeductions(
          context.companyId,
          req.params.id,
          context.actorUserId,
          (req.body as DeductionRequestBody).idempotencyKey,
        ),
    );
    res.status(201).json({ success: true, data });
  }

  async confirmDeduction(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      'loans.payroll-deduction.confirmed',
      'loan_payroll_deduction',
      (repository) =>
        repository.confirmDeduction(
          context.companyId,
          context.actorUserId,
          req.params.deductionId,
          req.body as DeductionConfirmationBody,
        ),
    );
    res.status(200).json({ success: true, data });
  }

  async deductions(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.listDeductions(companyId, req.query as never),
    );
    res.status(200).json({ success: true, ...data });
  }

  async requestRenegotiation(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      'loans.renegotiation.requested',
      'loan_renegotiation',
      (repository) =>
        repository.requestRenegotiation(
          context.companyId,
          context.actorUserId,
          req.params.id,
          req.body as RenegotiationBody,
        ),
    );
    res.status(201).json({ success: true, data });
  }

  async decideRenegotiation(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as RenegotiationDecisionBody;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      `loans.renegotiation.${body.decision.toLowerCase()}`,
      'loan_renegotiation',
      (repository) =>
        repository.decideRenegotiation(
          context.companyId,
          context.actorUserId,
          req.params.renegotiationId,
          body.decision,
        ),
    );
    res.status(200).json({ success: true, data });
  }

  async setLoanStatus(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as LoanStatusActionBody;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      `loans.loan.${body.action.toLowerCase()}`,
      'employee_loan',
      (repository) =>
        repository.setLoanStatus(
          context.companyId,
          context.actorUserId,
          req.params.id,
          body.action,
        ),
    );
    res.status(200).json({ success: true, data });
  }

  async settleLoan(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      'loans.loan.settled',
      'employee_loan',
      (repository) => repository.settleLoan(context.companyId, context.actorUserId, req.params.id),
    );
    res.status(200).json({ success: true, data });
  }

  async policies(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) => repository.listPolicies(companyId));
    res.status(200).json({ success: true, data });
  }

  async createPolicy(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.loans.execute(
      context.companyId,
      context.actorUserId,
      'loans.policy.created',
      'loan_policy',
      (repository) =>
        repository.createPolicy(context.companyId, context.actorUserId, req.body as PolicyBody),
    );
    res.status(201).json({ success: true, data });
  }

  async simulate(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.simulate(companyId, req.body as SimulationBody),
    );
    res.status(200).json({ success: true, data });
  }

  async summary(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) => repository.summary(companyId));
    res.status(200).json({ success: true, data });
  }

  async outstanding(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.outstandingReport(companyId, req.query as never),
    );
    res.status(200).json({ success: true, ...data });
  }

  async lateInstallments(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.listLateInstallments(companyId, req.query as never),
    );
    res.status(200).json({ success: true, ...data });
  }

  async history(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.loans.query((repository) =>
      repository.history(companyId, req.params.id),
    );
    res.status(200).json({ success: true, data });
  }

  private context(req: Request, res: Response): Context | null {
    const companyId = this.companyId(res);
    const actorUserId = req.user?.userId;
    if (companyId === null) return null;
    if (!actorUserId) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return null;
    }
    return { companyId, actorUserId };
  }

  private companyId(res: Response): number | null {
    const companyId = res.req.tenant?.companyId;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company context is required.' });
      return null;
    }
    return companyId;
  }
}
