import { Request, Response } from 'express';
import { LeaveReportsUseCase } from '../../application/use-cases/leave-reports.use-case';
import { ManageLeaveAccountsUseCase } from '../../application/use-cases/manage-leave-accounts.use-case';
import { ManageLeavePlanningUseCase } from '../../application/use-cases/manage-leave-planning.use-case';
import { ManageLeaveRequestsUseCase } from '../../application/use-cases/manage-leave-requests.use-case';
import {
  AccrueEntitlementInput,
  AdjustBalanceInput,
  ApproveLeaveInput,
  CompleteLeaveInput,
  CreateLeaveInput,
  InterruptLeaveInput,
  RecalculateEntitlementsInput,
  RejectLeaveInput,
  RescheduleLeaveInput,
  ReturnLeaveInput,
  SubmitLeaveInput,
  UpdateLeaveInput,
  VersionInput,
} from './leave.controller-types';

type ActorContext = { companyId: number; actorUserId: number };

/**
 * Controlador HTTP do módulo `leave`.
 *
 * Convenções do projecto:
 *   - contexto de tenant de `res.req.tenant` (`X-Company-Id`);
 *   - actor de `req.user.userId` (401 quando ausente);
 *   - respostas `{success:true,data}` / listas com `pagination`;
 *   - `Idempotency-Key` encaminhado para approve/complete/cancel.
 */
export class LeaveController {
  constructor(
    private readonly accounts: ManageLeaveAccountsUseCase,
    private readonly requests: ManageLeaveRequestsUseCase,
    private readonly planning: ManageLeavePlanningUseCase,
    private readonly reports: LeaveReportsUseCase,
  ) {}

  // ----------------------------------------------------------
  // Contas, direitos e saldos
  // ----------------------------------------------------------

  async listAccounts(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const result = await this.accounts.listAccounts(companyId, req.query as never);
    res.status(200).json({ success: true, ...result });
  }

  async createAccount(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as { employeeId: string };
    const data = await this.accounts.createAccount({ ...context, employeeId: body.employeeId });
    res.status(201).json({ success: true, data });
  }

  async getAccount(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.accounts.getAccount(companyId, req.params.id);
    res.status(200).json({ success: true, data });
  }

  async getBalance(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.accounts.getBalance(companyId, req.params.id);
    res.status(200).json({ success: true, data });
  }

  async listMovements(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const result = await this.accounts.listMovements(companyId, req.params.id, req.query as never);
    res.status(200).json({ success: true, ...result });
  }

  async listEntitlements(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.accounts.listEntitlements(companyId, req.params.id);
    res.status(200).json({ success: true, data });
  }

  async accrueEntitlement(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as AccrueEntitlementInput;
    const data = await this.accounts.accrueEntitlement({
      ...context,
      accountId: req.params.id,
      ...body,
    });
    res.status(201).json({ success: true, data });
  }

  async recalculateEntitlements(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as RecalculateEntitlementsInput;
    const data = await this.accounts.recalculateEntitlements({
      ...context,
      accountId: req.params.id,
      ...body,
    });
    res.status(200).json({ success: true, data });
  }

  async adjustBalance(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as AdjustBalanceInput;
    const data = await this.accounts.adjustBalance({
      ...context,
      accountId: req.params.id,
      ...body,
    });
    res.status(201).json({ success: true, data });
  }

  // ----------------------------------------------------------
  // Pedidos de férias
  // ----------------------------------------------------------

  async listRequests(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const result = await this.requests.list(companyId, req.query as never);
    res.status(200).json({ success: true, ...result });
  }

  async createRequest(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as CreateLeaveInput;
    const data = await this.requests.create({ ...context, ...body });
    res.status(201).json({ success: true, data });
  }

  async getRequest(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.requests.get(companyId, req.params.id);
    res.status(200).json({ success: true, data });
  }

  async getRequestHistory(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.requests.history(companyId, req.params.id);
    res.status(200).json({ success: true, data });
  }

  async updateRequest(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as UpdateLeaveInput;
    const data = await this.requests.updateDraft({ ...context, id: req.params.id, ...body });
    res.status(200).json({ success: true, data });
  }

  async submitRequest(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as SubmitLeaveInput;
    const data = await this.requests.submit({ ...context, id: req.params.id, ...body });
    res.status(200).json({ success: true, data });
  }

  async approveRequest(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as ApproveLeaveInput;
    const data = await this.requests.approve({
      ...context,
      id: req.params.id,
      ...body,
      idempotencyKey: this.idempotencyKey(req),
    });
    res.status(200).json({ success: true, data });
  }

  async rejectRequest(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as RejectLeaveInput;
    const data = await this.requests.reject({ ...context, id: req.params.id, ...body });
    res.status(200).json({ success: true, data });
  }

  async returnRequest(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as ReturnLeaveInput;
    const data = await this.requests.returnRequest({ ...context, id: req.params.id, ...body });
    res.status(200).json({ success: true, data });
  }

  async cancelRequest(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as VersionInput;
    const data = await this.requests.cancel({
      ...context,
      id: req.params.id,
      ...body,
      idempotencyKey: this.idempotencyKey(req),
    });
    res.status(200).json({ success: true, data });
  }

  async rescheduleRequest(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as RescheduleLeaveInput;
    const data = await this.requests.reschedule({ ...context, id: req.params.id, ...body });
    res.status(200).json({ success: true, data });
  }

  async startRequest(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as VersionInput;
    const data = await this.requests.start({ ...context, id: req.params.id, ...body });
    res.status(200).json({ success: true, data });
  }

  async interruptRequest(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as InterruptLeaveInput;
    const data = await this.requests.interrupt({ ...context, id: req.params.id, ...body });
    res.status(200).json({ success: true, data });
  }

  async completeRequest(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as CompleteLeaveInput;
    const data = await this.requests.complete({
      ...context,
      id: req.params.id,
      ...body,
      idempotencyKey: this.idempotencyKey(req),
    });
    res.status(200).json({ success: true, data });
  }

  // ----------------------------------------------------------
  // Planeamento
  // ----------------------------------------------------------

  async calendar(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const query = req.query as {
      startDate: string;
      endDate: string;
      establishmentId?: string;
    };
    const data = await this.planning.getCalendar(
      companyId,
      query.startDate,
      query.endDate,
      { establishmentId: query.establishmentId ?? null },
    );
    res.status(200).json({ success: true, data });
  }

  async conflicts(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.planning.findConflicts({
      companyId,
      ...(req.query as {
        employeeId: string;
        startDate: string;
        endDate: string;
        excludeRequestId?: string;
      }),
    });
    res.status(200).json({ success: true, data });
  }

  async absences(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.planning.findAbsencesOnDate(
      companyId,
      (req.query as { date: string }).date,
    );
    res.status(200).json({ success: true, data });
  }

  // ----------------------------------------------------------
  // Relatórios
  // ----------------------------------------------------------

  async balances(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const result = await this.reports.listBalances(companyId, req.query as never);
    res.status(200).json({ success: true, ...result });
  }

  async takenDays(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.reports.getTakenDays(companyId, req.query as never);
    res.status(200).json({ success: true, data });
  }

  // ----------------------------------------------------------
  // Contexto HTTP
  // ----------------------------------------------------------

  private context(req: Request, res: Response): ActorContext | null {
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

  private idempotencyKey(req: Request): string | undefined {
    const value = req.headers['idempotency-key'];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    return undefined;
  }
}
