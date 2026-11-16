import { createContractTypeSchema } from '../schemas/contract.schema';
import { Request, Response } from 'express';
import { ManageContractsUseCase } from '../../application/use-cases/manage-contracts.use-case';
import { CreateContractDto, UpdateDraftDto } from '../schemas/contract.schema';

export class ContractsController {
  constructor(private readonly contracts: ManageContractsUseCase) {}

  async list(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const result = await this.contracts.list(companyId, req.query as never);
    res.status(200).json({ success: true, ...result });
  }

  async create(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as CreateContractDto;
    const result = await this.contracts.create({ ...context, ...body });
    res.status(201).json({ success: true, data: result });
  }

  async get(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    res
      .status(200)
      .json({ success: true, data: await this.contracts.get(companyId, req.params.id) });
  }

  async updateDraft(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const { expectedVersion, ...changes } = req.body as UpdateDraftDto;
    const result = await this.contracts.updateDraft({
      ...context,
      id: req.params.id,
      expectedVersion,
      changes,
    });
    res.status(200).json({ success: true, data: result });
  }

  async transition(
    req: Request,
    res: Response,
    status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'CANCELLED' | 'TERMINATED',
    explicitRecordType?: string,
  ): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as {
      expectedVersion: number;
      reason?: string;
      effectiveDate?: string;
      reasonCode?: string;
    };
    if (status === 'APPROVED') {
      const data = await this.contracts.approve({
        ...context,
        id: req.params.id,
        expectedVersion: body.expectedVersion,
      });
      res.status(200).json({ success: true, data });
      return;
    }
    const recordType =
      explicitRecordType ??
      (status === 'PENDING_APPROVAL'
        ? 'SUBMITTED'
        : status === 'TERMINATED'
          ? 'TERMINATION'
          : status);
    const data = await this.contracts.transition({
      ...context,
      id: req.params.id,
      expectedVersion: body.expectedVersion,
      status,
      recordType,
      payload: {
        reason: body.reason,
        effectiveDate: body.effectiveDate,
        reasonCode: body.reasonCode,
      },
    });
    res.status(200).json({ success: true, data });
  }

  async renew(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as { expectedVersion: number; newEndDate: string; reason: string };
    const data = await this.contracts.addRecord({
      ...context,
      id: req.params.id,
      expectedVersion: body.expectedVersion,
      recordType: 'RENEWAL',
      payload: { newEndDate: body.newEndDate, reason: body.reason },
    });
    res.status(201).json({ success: true, data });
  }

  async amend(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as {
      expectedVersion: number;
      effectiveDate: string;
      reason: string;
      changes: Record<string, unknown>;
    };
    const changes: Record<string, unknown> = {};
    if (body.changes.salaryAmount !== undefined) changes.salaryAmount = body.changes.salaryAmount;
    if (body.changes.currency !== undefined) changes.currency = body.changes.currency;
    if (body.changes.terms !== undefined) changes.terms = body.changes.terms;
    const data = await this.contracts.addRecord({
      ...context,
      id: req.params.id,
      expectedVersion: body.expectedVersion,
      recordType: 'AMENDMENT',
      payload: { effectiveDate: body.effectiveDate, reason: body.reason, changes },
    });
    res.status(201).json({ success: true, data });
  }

  async suspend(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as {
      expectedVersion: number;
      startDate: string;
      endDate?: string | null;
      reason: string;
    };
    const data = await this.contracts.addRecord({
      ...context,
      id: req.params.id,
      expectedVersion: body.expectedVersion,
      recordType: 'SUSPENSION',
      payload: { startDate: body.startDate, endDate: body.endDate ?? null, reason: body.reason },
    });
    res.status(200).json({ success: true, data });
  }

  async resume(req: Request, res: Response): Promise<void> {
    return this.transition(req, res, 'ACTIVE', 'RESUMPTION');
  }

  async terminate(req: Request, res: Response): Promise<void> {
    return this.transition(req, res, 'TERMINATED', 'TERMINATION');
  }

  async archive(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as { expectedVersion: number; reason?: string };
    const data = await this.contracts.addRecord({
      ...context,
      id: req.params.id,
      expectedVersion: body.expectedVersion,
      recordType: 'ARCHIVE',
      payload: { reason: body.reason ?? null },
    });
    res.status(200).json({ success: true, data });
  }

  async expiring(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    res.status(200).json({
      success: true,
      ...(await this.contracts.expiring(companyId, Number(req.query.days))),
    });
  }

  async types(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    res.status(200).json({ success: true, data: await this.contracts.types(companyId) });
  }

  async createType(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const data = await this.contracts.createType({
      ...createContractTypeSchema.parse(req.body),
      ...context,
    });
    res.status(201).json({ success: true, data });
  }

  async records(req: Request, res: Response, type?: string): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    await this.contracts.assertExists(companyId, req.params.id);
    const data = await this.contracts.records(companyId, req.params.id, type);
    res.status(200).json({ success: true, data });
  }

  async addDocument(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as { documentId: string; documentType: string };
    const contract = await this.contracts.get(context.companyId, req.params.id);
    const data = await this.contracts.addRecord({
      ...context,
      id: req.params.id,
      expectedVersion: contract.version,
      recordType: 'DOCUMENT',
      payload: body,
    });
    res.status(201).json({ success: true, data });
  }

  private context(req: Request, res: Response): { companyId: number; actorUserId: number } | null {
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
