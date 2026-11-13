import { Request, Response } from 'express';
import { ManageAttendanceUseCase } from '../../application/use-cases/manage-attendance.use-case';
import { AttendanceEntityType } from '../../infrastructure/persistence/model/attendance-entity.model';
import { listAttendanceSchema } from '../schemas/attendance.schema';

export class AttendanceController {
  constructor(private readonly attendance: ManageAttendanceUseCase) {}

  async recordPunch(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const result = await this.attendance.recordPunch(
      context.companyId,
      context.actorUserId,
      req.body,
    );
    res.status(201).json({ success: true, data: result });
  }

  async importPunches(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const { rows, batchKey } = req.body as { rows: never[]; batchKey: string };
    const result = await this.attendance.importPunches(
      context.companyId,
      context.actorUserId,
      rows,
      batchKey,
    );
    res.status(200).json({ success: true, data: result });
  }

  async listPunches(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    res.status(200).json({
      success: true,
      ...(await this.attendance.listPunches(companyId, req.query as never)),
    });
  }

  async getPunch(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    res
      .status(200)
      .json({ success: true, data: await this.attendance.getPunch(companyId, req.params.id) });
  }

  async listEmployeePunches(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const query = listAttendanceSchema.parse(req.query);
    res.status(200).json({
      success: true,
      ...(await this.attendance.listPunches(companyId, {
        ...query,
        employeeId: req.params.employeeId,
      })),
    });
  }

  async calculateDay(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const { employeeId, workDate } = req.body as { employeeId: string; workDate: string };
    const result = await this.attendance.recalculateDay(
      context.companyId,
      context.actorUserId,
      employeeId,
      workDate,
    );
    res.status(200).json({ success: true, data: result });
  }

  async listDays(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    res
      .status(200)
      .json({ success: true, ...(await this.attendance.listDays(companyId, req.query as never)) });
  }

  async createJustification(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const { reason, evidence } = req.body as { reason: string; evidence?: string };
    const occurrenceId = req.params.id ?? (req.body as { occurrenceId?: string }).occurrenceId;
    const result = await this.attendance.createJustification(
      context.companyId,
      context.actorUserId,
      occurrenceId,
      reason,
      evidence,
    );
    res.status(201).json({ success: true, data: result });
  }

  async decideJustification(
    req: Request,
    res: Response,
    decisionOverride?: 'APPROVED' | 'REJECTED' | 'RETURNED',
  ): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = (req.body ?? {}) as { decision?: 'APPROVED' | 'REJECTED'; reason?: string };
    const decision = decisionOverride ?? body.decision;
    if (!decision) {
      res.status(400).json({ success: false, message: 'A justification decision is required.' });
      return;
    }
    const result = await this.attendance.decideJustification(
      context.companyId,
      context.actorUserId,
      req.params.id,
      decision,
      body.reason,
    );
    res.status(200).json({ success: true, data: result });
  }

  async requestCorrection(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const recordId = req.params.id ?? (req.body as { recordId?: string }).recordId;
    const { recordId: _recordId, ...changes } = req.body as {
      recordId?: string;
      punchType?: string;
      occurredAt?: string;
      reason: string;
    };
    const result = await this.attendance.requestCorrection(
      context.companyId,
      context.actorUserId,
      recordId,
      changes,
    );
    res.status(201).json({ success: true, data: result });
  }

  async requestRectification(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const { recordId, ...changes } = req.body as {
      recordId: string;
      punchType?: string;
      occurredAt?: string;
      reason: string;
    };
    const result = await this.attendance.requestRectification(
      context.companyId,
      context.actorUserId,
      req.params.id,
      recordId,
      changes,
    );
    res.status(201).json({ success: true, data: result });
  }

  async decideCorrection(
    req: Request,
    res: Response,
    decisionOverride?: 'APPROVED' | 'REJECTED',
  ): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = (req.body ?? {}) as { decision?: 'APPROVED' | 'REJECTED'; reason?: string };
    const decision = decisionOverride ?? body.decision;
    if (!decision) {
      res.status(400).json({ success: false, message: 'A correction decision is required.' });
      return;
    }
    const result = await this.attendance.decideCorrection(
      context.companyId,
      context.actorUserId,
      req.params.id,
      decision,
      body.reason,
    );
    res.status(200).json({ success: true, data: result });
  }

  async createPeriod(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const { startDate, endDate } = req.body as { startDate: string; endDate: string };
    const result = await this.attendance.createPeriod(
      context.companyId,
      context.actorUserId,
      startDate,
      endDate,
    );
    res.status(201).json({ success: true, data: result });
  }

  async closePeriod(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const result = await this.attendance.closePeriod(
      context.companyId,
      context.actorUserId,
      req.params.id,
    );
    res.status(200).json({ success: true, data: result });
  }

  async validatePeriod(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const result = await this.attendance.validatePeriod(
      context.companyId,
      context.actorUserId,
      req.params.id,
    );
    res.status(200).json({ success: true, data: result });
  }

  async getPeriod(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.attendance.getPeriod(companyId, req.params.id);
    res.status(200).json({ success: true, data: result });
  }

  async listSnapshots(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const result = await this.attendance.listSnapshots(companyId, req.params.id);
    res.status(200).json({ success: true, data: result });
  }

  async attendanceSummary(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const { from, to } = req.query as { from: string; to: string };
    const result = await this.attendance.attendanceSummary(companyId, from, to);
    res.status(200).json({ success: true, data: result });
  }

  async listEntities(req: Request, res: Response, type: AttendanceEntityType): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    res.status(200).json({
      success: true,
      ...(await this.attendance.listEntities(companyId, type, req.query as never)),
    });
  }

  async getEntity(req: Request, res: Response, type: AttendanceEntityType): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    res.status(200).json({
      success: true,
      data: await this.attendance.getEntity(companyId, req.params.id, type),
    });
  }

  async getCorrection(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    res.status(200).json({
      success: true,
      data: await this.attendance.getCorrection(companyId, req.params.id),
    });
  }

  async listCorrections(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    res.status(200).json({
      success: true,
      ...(await this.attendance.listEntities(
        companyId,
        ['CORRECTION', 'RECTIFICATION'],
        req.query as never,
      )),
    });
  }

  async setPolicy(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const result = await this.attendance.setPolicy(
      context.companyId,
      context.actorUserId,
      req.body,
    );
    res.status(201).json({ success: true, data: result });
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
