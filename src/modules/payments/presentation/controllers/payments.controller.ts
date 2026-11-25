import { Request, Response } from 'express';
import { PaymentsApplicationService } from '../../application/use-cases/payments-application.service';
import { payrollPdf } from '../../../payroll/infrastructure/payroll-export';
import {
  bankAccountSchema,
  bankAccountUpdateSchema,
  batchApprovalSchema,
  exportRequestSchema,
  listQuerySchema,
  orderExecutionSchema,
  paymentBatchItemSchema,
  paymentBatchSchema,
  paymentBeneficiarySchema,
  paymentInstructionSchema,
  paymentPolicySchema,
  providerConfigurationSchema,
  reconcileSchema,
  statementImportSchema,
} from '../schemas/payments.schema';

export class PaymentsController {
  constructor(private readonly payments: PaymentsApplicationService) {}

  async listInstructions(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const query = listQuerySchema.parse(req.query);
    const result = await this.payments.listInstructions(companyId, query);
    res.status(200).json({ success: true, ...result });
  }

  async createInstruction(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const input = paymentInstructionSchema.parse(req.body);
    const result = await this.payments.createInstruction(
      context.companyId,
      context.actorUserId,
      input,
    );
    res.status(201).json({ success: true, data: result });
  }

  async getInstruction(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.getInstruction(companyId, req.params.id);
    res.status(200).json({ success: true, data: result });
  }

  async cancelInstruction(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const result = await this.payments.cancelInstruction(
      context.companyId,
      context.actorUserId,
      req.params.id,
    );
    res.status(200).json({ success: true, data: result });
  }

  async setInstructionBeneficiary(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const input = paymentBeneficiarySchema.parse(req.body);
    const result = await this.payments.setInstructionBeneficiary(
      context.companyId,
      context.actorUserId,
      req.params.id,
      input,
    );
    res.status(200).json({ success: true, data: result });
  }

  async getInstructionHistory(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.listInstructionHistory(companyId, req.params.id);
    res.status(200).json({ success: true, data: result });
  }

  async listBatches(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const query = listQuerySchema.parse(req.query);
    const result = await this.payments.listBatches(companyId, query);
    res.status(200).json({ success: true, ...result });
  }

  async createBatch(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const input = paymentBatchSchema.parse(req.body);
    const result = await this.payments.createBatch(context.companyId, context.actorUserId, input);
    res.status(201).json({ success: true, data: result });
  }

  async getBatch(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.getBatch(companyId, req.params.id);
    res.status(200).json({ success: true, data: result });
  }

  async addBatchItem(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const input = paymentBatchItemSchema.parse(req.body);
    const result = await this.payments.addBatchItem(
      context.companyId,
      context.actorUserId,
      req.params.id,
      input,
    );
    res.status(201).json({ success: true, data: result });
  }

  async validateBatch(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const result = await this.payments.validateBatch(
      context.companyId,
      context.actorUserId,
      req.params.id,
    );
    res.status(200).json({ success: true, data: result });
  }

  async submitBatch(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const result = await this.payments.submitBatch(
      context.companyId,
      context.actorUserId,
      req.params.id,
    );
    res.status(200).json({ success: true, data: result });
  }

  async approveBatch(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const body = batchApprovalSchema.parse(req.body);
    const result = await this.payments.approveBatch(
      context.companyId,
      context.actorUserId,
      req.params.id,
      body.reason,
    );
    res.status(200).json({ success: true, data: result });
  }

  async rejectBatch(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const body = batchApprovalSchema.parse(req.body);
    const result = await this.payments.rejectBatch(
      context.companyId,
      context.actorUserId,
      req.params.id,
      body.reason,
    );
    res.status(200).json({ success: true, data: result });
  }

  async executeBatch(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const { providerId } = req.body as { providerId: string };
    const result = await this.payments.executeBatch(
      context.companyId,
      context.actorUserId,
      req.params.id,
      providerId,
    );
    res.status(200).json({ success: true, data: result });
  }

  async getBatchProgress(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const batch = await this.payments.getBatch(companyId, req.params.id);
    const total = batch.items.length;
    const progressed = batch.items.filter((item) => item.status !== 'PENDING').length;
    res.status(200).json({
      success: true,
      data: {
        id: batch.id,
        status: batch.status,
        total,
        progressed,
        pending: total - progressed,
      },
    });
  }

  async listOrders(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.listOrders(companyId);
    res.status(200).json({ success: true, data: result });
  }

  async getOrder(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.getOrder(companyId, req.params.id);
    res.status(200).json({ success: true, data: result });
  }

  async executeOrder(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const input = orderExecutionSchema.parse(req.body);
    const result = await this.payments.executeOrder(
      context.companyId,
      context.actorUserId,
      req.params.id,
      input,
    );
    res.status(200).json({ success: true, data: result });
  }

  async refreshOrderStatus(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const result = await this.payments.refreshOrderStatus(
      context.companyId,
      context.actorUserId,
      req.params.id,
    );
    res.status(200).json({ success: true, data: result });
  }

  async listOrderAttempts(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.listOrderAttempts(companyId, req.params.id);
    res.status(200).json({ success: true, data: result });
  }

  async listTransactions(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.listTransactions(companyId);
    res.status(200).json({ success: true, data: result });
  }

  async getTransaction(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.getTransaction(companyId, req.params.id);
    res.status(200).json({ success: true, data: result });
  }
  async transactionReceipt(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const document = await this.payments.transactionEvidence(context.companyId, context.actorUserId, req.params.id);
    const rows = [['COMPROVATIVO INTERNO DE PAGAMENTO'], ['Company ID', String(context.companyId)],
      ['Transaction', document.id], ['Payment order', document.orderId], ['Bank reference', document.reference],
      ['Amount', document.amount + ' ' + document.currency], ['Settled at', document.settledAt], ['Status', document.status]];
    res.attachment('payment-' + document.id + '.pdf').type('application/pdf')
      .set('X-Content-Type-Options', 'nosniff').send(payrollPdf(rows));
  }

  async reconcileTransaction(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const input = reconcileSchema.parse(req.body);
    const result = await this.payments.reconcileTransaction(
      context.companyId,
      context.actorUserId,
      req.params.id,
      input,
    );
    res.status(200).json({ success: true, data: result });
  }

  async listBankAccounts(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.listBankAccounts(companyId);
    res.status(200).json({ success: true, data: result });
  }

  async registerBankAccount(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const input = bankAccountSchema.parse(req.body);
    const result = await this.payments.registerBankAccount(
      context.companyId,
      context.actorUserId,
      input,
    );
    res.status(201).json({ success: true, data: result });
  }

  async updateBankAccount(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const input = bankAccountUpdateSchema.parse(req.body);
    const result = await this.payments.updateBankAccount(
      context.companyId,
      context.actorUserId,
      req.params.id,
      input,
    );
    res.status(200).json({ success: true, data: result });
  }

  async verifyBankAccount(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const result = await this.payments.verifyBankAccount(
      context.companyId,
      context.actorUserId,
      req.params.id,
    );
    res.status(200).json({ success: true, data: result });
  }

  async listProviders(req: Request, res: Response) {
    const result = this.payments.listProviders();
    res.status(200).json({ success: true, data: result });
  }
  async executionProviders(_req: Request, res: Response) {
    const company = this.companyId(res);
    if (company) res.json({ success: true, data: await this.payments.executionProviders(company) });
  }

  async configureProvider(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const input = providerConfigurationSchema.parse(req.body);
    const result = await this.payments.configureProvider(
      context.companyId,
      context.actorUserId,
      input,
    );
    res.status(201).json({ success: true, data: result });
  }

  async listProviderConfigurations(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.listProviderConfigurations(companyId);
    res.status(200).json({ success: true, data: result });
  }

  async getPaymentPolicy(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.getPaymentPolicy(companyId);
    res.status(200).json({ success: true, data: result });
  }

  async configurePaymentPolicy(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const input = paymentPolicySchema.parse(req.body);
    const result = await this.payments.configurePaymentPolicy(
      context.companyId,
      context.actorUserId,
      input,
    );
    res.status(200).json({ success: true, data: result });
  }

  async generateBankFile(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const input = exportRequestSchema.parse(req.body);
    const result = await this.payments.generateBankFile(
      context.companyId,
      context.actorUserId,
      input,
    );
    res.status(200).json({ success: true, data: result });
  }

  async importStatement(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const input = statementImportSchema.parse(req.body);
    const result = await this.payments.importStatement(
      context.companyId,
      context.actorUserId,
      input,
    );
    res.status(200).json({ success: true, data: result });
  }

  async listReconciliations(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.listReconciliations(companyId);
    res.status(200).json({ success: true, data: result });
  }

  async runReconciliation(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const { reference } = req.body as { reference: string };
    const result = await this.payments.runReconciliation(
      context.companyId,
      context.actorUserId,
      reference,
    );
    res.status(200).json({ success: true, data: result });
  }

  async getReconciliation(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.getReconciliation(companyId, req.params.id);
    res.status(200).json({ success: true, data: result });
  }

  async resolveReconciliationException(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const { notes, evidence } = (req.body ?? {}) as { notes: string; evidence: string[] };
    const result = await this.payments.resolveReconciliationException(
      context.companyId,
      context.actorUserId,
      req.params.id,
      { notes, evidence },
    );
    res.status(200).json({ success: true, data: result });
  }

  async listReturns(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.listReturns(companyId);
    res.status(200).json({ success: true, data: result });
  }

  async summaryReport(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.getSummary(companyId);
    res.status(200).json({ success: true, data: result });
  }

  async settlementReport(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.settlementReport(companyId);
    res.status(200).json({ success: true, data: result });
  }

  async failedReport(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.failedReport(companyId);
    res.status(200).json({ success: true, data: result });
  }

  async returnsReport(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.listReturns(companyId);
    res.status(200).json({ success: true, data: result });
  }

  async reconciliationReport(req: Request, res: Response) {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.payments.reconciliationReport(companyId);
    res.status(200).json({ success: true, data: result });
  }

  async exportReport(req: Request, res: Response) {
    const context = this.context(req, res);
    if (!context) return;
    const input = exportRequestSchema.parse(req.body);
    const result = await this.payments.exportReport(context.companyId, context.actorUserId, input);
    res.status(200).json({ success: true, data: result });
  }

  private context(req: Request, res: Response): { companyId: number; actorUserId: number } | null {
    const companyId = this.companyId(res);
    const actorUserId = req.user?.userId;
    if (!companyId) return null;
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
