import { Op, QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import { LeaveAccountProps } from '../../../domain/aggregates/leave-account.aggregate';
import { LeaveRequestProps, LeaveType } from '../../../domain/aggregates/leave-request.aggregate';
import {
  LeaveAbsenceRecord,
  LeaveAccountListQuery,
  LeaveBalanceSummary,
  LeaveEntitlementRecord,
  LeaveMovementRecord,
  LeavePeriodRecord,
  LeaveReportQuery,
  LeaveRepository,
  LeaveRequestListQuery,
  PaginatedLeave,
} from '../../../domain/repositories/leave.repository';
import { LeaveMovementType } from '../../../domain/value-objects/leave-balance.vo';
import { LeaveBalance } from '../../../domain/value-objects/leave-balance.vo';
import { BLOCKING_LEAVE_STATUSES } from '../../../domain/value-objects/leave-status.vo';
import { LeaveAccountModel } from '../model/leave-account.model';
import { LeaveApprovalModel } from '../model/leave-approval.model';
import { LeaveBalanceMovementModel } from '../model/leave-balance-movement.model';
import { LeaveEntitlementModel } from '../model/leave-entitlement.model';
import { LeaveRequestModel } from '../model/leave-request.model';
import { LeaveRequestPeriodModel } from '../model/leave-request-period.model';

// ============================================================
// Helpers
// ============================================================

const dateOnly = (value: unknown): string => String(value).slice(0, 10);

const startOfDay = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const endOfDay = (value: string): Date => new Date(`${value}T23:59:59.999Z`);

/** Consultas lêem sempre com tenant aplicado (mesmo padrão das escritas). */
const withTenant = async <T>(
  companyId: number,
  operation: (transaction: Transaction) => Promise<T>,
): Promise<T> =>
  sequelize.transaction(async (transaction) => {
    if (sequelize.getDialect() === 'postgres') {
      await sequelize.query("SELECT set_config('app.current_tenant', :companyId, true)", {
        replacements: { companyId: String(companyId) },
        type: QueryTypes.SELECT,
        transaction,
      });
    }
    return operation(transaction);
  });

const mapAccount = (row: LeaveAccountModel): LeaveAccountProps => ({
  id: row.id,
  companyId: row.companyId,
  employeeId: row.employeeId,
  status: row.status as LeaveAccountProps['status'],
  version: row.version,
});

const mapRequestRow = (row: LeaveRequestModel): LeaveRequestProps => ({
  id: row.id,
  companyId: row.companyId,
  employeeId: row.employeeId,
  accountId: row.accountId,
  leaveType: row.leaveType as LeaveType,
  status: row.status as LeaveRequestProps['status'],
  reason: row.reason,
  requestedDays: row.requestedDays,
  startDate: dateOnly(row.startDate),
  endDate: dateOnly(row.endDate),
  submittedAt: row.submittedAt,
  decidedAt: row.decidedAt,
  createdByUserId: row.createdByUserId,
  version: row.version,
  periods: [],
  approvals: [],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const mapMovement = (row: LeaveBalanceMovementModel): LeaveMovementRecord => ({
  id: row.id,
  companyId: row.companyId,
  accountId: row.accountId,
  entitlementId: row.entitlementId,
  movementType: row.movementType as LeaveMovementType,
  days: row.days,
  referenceId: row.referenceId,
  reason: row.reason,
  actorUserId: row.actorUserId,
  createdAt: row.createdAt,
});

const paginationOf = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

/**
 * Implementação de LEITURA da porta `LeaveRepository`.
 *
 * Todas as consultas filtram por `companyId` (isolamento por
 * aplicação — RN-001..004) e correm com o contexto de tenant
 * aplicado, tal como as escritas da `LeaveWorkUnit`.
 */
export class SequelizeLeaveRepository implements LeaveRepository {
  // ----------------------------------------------------------
  // Contas
  // ----------------------------------------------------------

  async findAccount(companyId: number, id: string): Promise<LeaveAccountProps | null> {
    return withTenant(companyId, async (transaction) => {
      const row = await LeaveAccountModel.findOne({
        where: { id, companyId },
        transaction,
      });
      return row ? mapAccount(row) : null;
    });
  }

  async findAccountByEmployee(
    companyId: number,
    employeeId: string,
  ): Promise<LeaveAccountProps | null> {
    return withTenant(companyId, async (transaction) => {
      const row = await LeaveAccountModel.findOne({
        where: { companyId, employeeId },
        transaction,
      });
      return row ? mapAccount(row) : null;
    });
  }

  async listAccounts(
    companyId: number,
    query: LeaveAccountListQuery,
  ): Promise<PaginatedLeave<LeaveAccountProps>> {
    return withTenant(companyId, async (transaction) => {
      const where: Record<string | symbol, unknown> = { companyId };
      if (query.employeeId) where.employeeId = query.employeeId;
      if (query.status) where.status = query.status;

      const result = await LeaveAccountModel.findAndCountAll({
        where,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        order: [
          ['createdAt', 'DESC'],
          ['id', 'ASC'],
        ],
        transaction,
      });

      return {
        data: result.rows.map(mapAccount),
        pagination: paginationOf(query.page, query.limit, result.count),
      };
    });
  }

  async listBalances(
    companyId: number,
    query: LeaveAccountListQuery,
  ): Promise<PaginatedLeave<LeaveBalanceSummary>> {
    return withTenant(companyId, async (transaction) => {
      const where: Record<string | symbol, unknown> = { companyId };
      if (query.employeeId) where.employeeId = query.employeeId;
      if (query.status) where.status = query.status;

      const result = await LeaveAccountModel.findAndCountAll({
        where,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        order: [
          ['createdAt', 'DESC'],
          ['id', 'ASC'],
        ],
        transaction,
      });

      const accountIds = result.rows.map((row) => row.id);
      const movements = accountIds.length
        ? await LeaveBalanceMovementModel.findAll({
            where: { companyId, accountId: { [Op.in]: accountIds } },
            transaction,
          })
        : [];

      const byAccount = new Map<string, Array<{ movementType: LeaveMovementType; days: number }>>();
      for (const movement of movements) {
        const list = byAccount.get(movement.accountId) ?? [];
        list.push({
          movementType: movement.movementType as LeaveMovementType,
          days: movement.days,
        });
        byAccount.set(movement.accountId, list);
      }

      return {
        data: result.rows.map((row) => {
          const balance = LeaveBalance.fromMovements(byAccount.get(row.id) ?? []);
          return {
            accountId: row.id,
            employeeId: row.employeeId,
            ...balance.toPrimitives(),
          };
        }),
        pagination: paginationOf(query.page, query.limit, result.count),
      };
    });
  }

  async sumTakenDays(companyId: number, query: LeaveReportQuery): Promise<number> {
    return withTenant(companyId, async (transaction) => {
      const accountWhere: Record<string | symbol, unknown> = { companyId };
      if (query.employeeId) accountWhere.employeeId = query.employeeId;

      const accounts = await LeaveAccountModel.findAll({
        where: accountWhere,
        attributes: ['id'],
        transaction,
      });
      const accountIds = accounts.map((row) => row.id);
      if (accountIds.length === 0) return 0;

      const where: Record<string | symbol, unknown> = {
        companyId,
        accountId: { [Op.in]: accountIds },
        movementType: 'USAGE',
      };
      if (query.startDate && query.endDate) {
        where.createdAt = { [Op.between]: [startOfDay(query.startDate), endOfDay(query.endDate)] };
      } else if (query.startDate) {
        where.createdAt = { [Op.gte]: startOfDay(query.startDate) };
      } else if (query.endDate) {
        where.createdAt = { [Op.lte]: endOfDay(query.endDate) };
      }

      const [row] = (await LeaveBalanceMovementModel.findAll({
        where,
        attributes: [[sequelize.fn('SUM', sequelize.col('days')), 'total']],
        raw: true,
        transaction,
      })) as unknown as Array<{ total: string | number | null }>;

      // USAGE é negativo no ledger — o relatório devolve dias positivos.
      return Math.abs(Number(row?.total ?? 0));
    });
  }

  // ----------------------------------------------------------
  // Direitos e movimentos
  // ----------------------------------------------------------

  async listEntitlements(
    companyId: number,
    accountId: string,
  ): Promise<LeaveEntitlementRecord[]> {
    return withTenant(companyId, async (transaction) => {
      const rows = await LeaveEntitlementModel.findAll({
        where: { companyId, accountId },
        order: [['accrualPeriodStart', 'ASC']],
        transaction,
      });
      return rows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        accountId: row.accountId,
        accrualPeriodStart: dateOnly(row.accrualPeriodStart),
        accrualPeriodEnd: dateOnly(row.accrualPeriodEnd),
        days: row.days,
        legalRuleVersionId: row.legalRuleVersionId,
        createdAt: row.createdAt,
      }));
    });
  }

  async listMovements(
    companyId: number,
    accountId: string,
    query: { page: number; limit: number; movementType?: LeaveMovementType },
  ): Promise<PaginatedLeave<LeaveMovementRecord>> {
    return withTenant(companyId, async (transaction) => {
      const where: Record<string | symbol, unknown> = { companyId, accountId };
      if (query.movementType) where.movementType = query.movementType;

      const result = await LeaveBalanceMovementModel.findAndCountAll({
        where,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        order: [
          ['createdAt', 'ASC'],
          ['id', 'ASC'],
        ],
        transaction,
      });

      return {
        data: result.rows.map(mapMovement),
        pagination: paginationOf(query.page, query.limit, result.count),
      };
    });
  }

  async getBalance(companyId: number, accountId: string): Promise<LeaveBalanceSummary | null> {
    return withTenant(companyId, async (transaction) => {
      const account = await LeaveAccountModel.findOne({
        where: { id: accountId, companyId },
        transaction,
      });
      if (!account) return null;

      const movements = await LeaveBalanceMovementModel.findAll({
        where: { companyId, accountId },
        transaction,
      });
      const balance = LeaveBalance.fromMovements(
        movements.map((row) => ({
          movementType: row.movementType as LeaveMovementType,
          days: row.days,
        })),
      );

      return {
        accountId: account.id,
        employeeId: account.employeeId,
        ...balance.toPrimitives(),
      };
    });
  }

  // ----------------------------------------------------------
  // Pedidos
  // ----------------------------------------------------------

  async findRequest(companyId: number, id: string): Promise<LeaveRequestProps | null> {
    return withTenant(companyId, async (transaction) => {
      const row = await LeaveRequestModel.findOne({
        where: { id, companyId },
        transaction,
      });
      if (!row) return null;
      return this.withChildren(companyId, row, transaction);
    });
  }

  async listRequests(
    companyId: number,
    query: LeaveRequestListQuery,
  ): Promise<PaginatedLeave<LeaveRequestProps>> {
    return withTenant(companyId, async (transaction) => {
      const where: Record<string | symbol, unknown> = { companyId };
      if (query.employeeId) where.employeeId = query.employeeId;
      if (query.status) where.status = query.status;
      if (query.leaveType) where.leaveType = query.leaveType;
      if (query.startDate) where.endDate = { [Op.gte]: query.startDate };
      if (query.endDate) where.startDate = { [Op.lte]: query.endDate };

      const result = await LeaveRequestModel.findAndCountAll({
        where,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        order: [
          ['startDate', 'DESC'],
          ['createdAt', 'DESC'],
        ],
        transaction,
      });

      const data: LeaveRequestProps[] = [];
      for (const row of result.rows) {
        data.push(await this.withChildren(companyId, row, transaction));
      }

      return { data, pagination: paginationOf(query.page, query.limit, result.count) };
    });
  }

  async getRequestHistory(
    companyId: number,
    requestId: string,
  ): Promise<{
    periods: LeaveRequestProps['periods'];
    approvals: LeaveRequestProps['approvals'];
  }> {
    return withTenant(companyId, async (transaction) => {
      const periodRows = await LeaveRequestPeriodModel.findAll({
        where: { companyId, requestId },
        order: [['startDate', 'ASC']],
        transaction,
      });
      const approvalRows = await LeaveApprovalModel.findAll({
        where: { companyId, requestId },
        order: [['decidedAt', 'ASC']],
        transaction,
      });

      return {
        periods: periodRows.map((period) => ({
          id: period.id,
          companyId: period.companyId,
          requestId: period.requestId,
          startDate: dateOnly(period.startDate),
          endDate: dateOnly(period.endDate),
          calculatedDays: period.calculatedDays,
        })),
        approvals: approvalRows.map((approval) => ({
          id: approval.id,
          companyId: approval.companyId,
          requestId: approval.requestId,
          approverUserId: approval.approverUserId,
          decision: approval.decision,
          comments: approval.comments,
          decidedAt: approval.decidedAt,
        })),
      };
    });
  }

  // ----------------------------------------------------------
  // Sobreposições e ausências
  // ----------------------------------------------------------

  async findOverlappingPeriods(
    companyId: number,
    employeeId: string,
    startDate: string,
    endDate: string,
    excludeRequestId?: string,
  ): Promise<LeavePeriodRecord[]> {
    return withTenant(companyId, async (transaction) => {
      const requests = await LeaveRequestModel.findAll({
        where: {
          companyId,
          employeeId,
          startDate: { [Op.lte]: endDate },
          endDate: { [Op.gte]: startDate },
          ...(excludeRequestId ? { id: { [Op.ne]: excludeRequestId } } : {}),
        },
        attributes: ['id', 'status'],
        transaction,
      });
      if (requests.length === 0) return [];

      const statusById = new Map(requests.map((row) => [row.id, row.status]));
      const periods = await LeaveRequestPeriodModel.findAll({
        where: {
          companyId,
          requestId: { [Op.in]: requests.map((row) => row.id) },
          startDate: { [Op.lte]: endDate },
          endDate: { [Op.gte]: startDate },
        },
        order: [['startDate', 'ASC']],
        transaction,
      });

      return periods.map((period) => ({
        requestId: period.requestId,
        status: (statusById.get(period.requestId) ??
          'DRAFT') as LeavePeriodRecord['status'],
        startDate: dateOnly(period.startDate),
        endDate: dateOnly(period.endDate),
        calculatedDays: period.calculatedDays,
      }));
    });
  }

  async findAbsencesOnDate(companyId: number, date: string): Promise<LeaveAbsenceRecord[]> {
    return withTenant(companyId, async (transaction) => {
      const requests = await LeaveRequestModel.findAll({
        where: {
          companyId,
          status: { [Op.in]: [...BLOCKING_LEAVE_STATUSES] },
          startDate: { [Op.lte]: date },
          endDate: { [Op.gte]: date },
        },
        attributes: ['id', 'employeeId', 'status'],
        transaction,
      });
      if (requests.length === 0) return [];

      const infoById = new Map(
        requests.map((row) => [row.id, { employeeId: row.employeeId, status: row.status }]),
      );
      const periods = await LeaveRequestPeriodModel.findAll({
        where: {
          companyId,
          requestId: { [Op.in]: requests.map((row) => row.id) },
          startDate: { [Op.lte]: date },
          endDate: { [Op.gte]: date },
        },
        transaction,
      });

      return periods.map((period) => {
        const info = infoById.get(period.requestId);
        return {
          requestId: period.requestId,
          employeeId: info?.employeeId ?? '',
          status: (info?.status ?? 'DRAFT') as LeavePeriodRecord['status'],
          startDate: dateOnly(period.startDate),
          endDate: dateOnly(period.endDate),
          calculatedDays: period.calculatedDays,
        };
      });
    });
  }

  // ----------------------------------------------------------
  // Privados
  // ----------------------------------------------------------

  /** Carrega o pedido com os segmentos e decisões. */
  private async withChildren(
    companyId: number,
    row: LeaveRequestModel,
    transaction: Transaction,
  ): Promise<LeaveRequestProps> {
    const base = mapRequestRow(row);

    const periodRows = await LeaveRequestPeriodModel.findAll({
      where: { companyId, requestId: base.id },
      order: [['startDate', 'ASC']],
      transaction,
    });
    const approvalRows = await LeaveApprovalModel.findAll({
      where: { companyId, requestId: base.id },
      order: [['decidedAt', 'ASC']],
      transaction,
    });

    return {
      ...base,
      periods: periodRows.map((period) => ({
        id: period.id,
        companyId: period.companyId,
        requestId: period.requestId,
        startDate: dateOnly(period.startDate),
        endDate: dateOnly(period.endDate),
        calculatedDays: period.calculatedDays,
      })),
      approvals: approvalRows.map((approval) => ({
        id: approval.id,
        companyId: approval.companyId,
        requestId: approval.requestId,
        approverUserId: approval.approverUserId,
        decision: approval.decision,
        comments: approval.comments,
        decidedAt: approval.decidedAt,
      })),
    };
  }
}
