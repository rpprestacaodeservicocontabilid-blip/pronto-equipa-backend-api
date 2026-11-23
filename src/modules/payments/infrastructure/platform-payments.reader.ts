import { col, fn, Model, ModelStatic, Op, WhereOptions } from 'sequelize';
import { AuditLogModel } from '../../audit/infrastructure/persistence/models/audit-log.model';
import { CompanyModel } from '../../tenancy/infrastructure/persistence/models/company.model';
import {
  PayrollPaymentAttemptModel,
  PayrollPaymentBatchItemModel,
  PayrollPaymentBatchModel,
  PayrollPaymentInstructionModel,
  PayrollPaymentOrderModel,
  PayrollPaymentPolicyModel,
  PayrollPaymentProviderConfigModel,
  PayrollPaymentReconciliationModel,
  PayrollPaymentReturnModel,
  PayrollPaymentStatementImportModel,
  PayrollPaymentTransactionModel,
} from './persistence/models/payment.models';

interface Directory {
  model: ModelStatic<Model>;
  fields: readonly string[];
  date?: string;
}

const directories = {
  instructions: { model: PayrollPaymentInstructionModel, fields: ['payrollResultId', 'amount', 'currency', 'paymentType', 'method', 'status'] },
  orders: { model: PayrollPaymentOrderModel, fields: ['batchId', 'instructionId', 'providerId', 'amount', 'currency', 'status', 'submittedAt'] },
  batches: { model: PayrollPaymentBatchModel, fields: ['code', 'totalAmount', 'currency', 'status', 'approvedAt'] },
  transactions: { model: PayrollPaymentTransactionModel, fields: ['orderId', 'providerReference', 'amount', 'currency', 'status', 'settledAt'] },
  returns: { model: PayrollPaymentReturnModel, fields: ['transactionId', 'amount', 'currency'], date: 'returnedAt' },
  reconciliations: { model: PayrollPaymentReconciliationModel, fields: ['transactionId', 'externalAmount', 'externalCurrency', 'status', 'resolvedAt'] },
  integrations: { model: PayrollPaymentProviderConfigModel, fields: ['providerId', 'providerType', 'status'] },
  files: { model: PayrollPaymentStatementImportModel, fields: ['status', 'rowCount', 'importedBy'] },
  policies: { model: PayrollPaymentPolicyModel, fields: ['baseApprovals', 'highValueThreshold', 'highValueApprovals', 'active'] },
  audit: { model: AuditLogModel, fields: ['actorUserId', 'action', 'entityType', 'entityId'] },
} satisfies Record<string, Directory>;

export type PaymentDirectory = keyof typeof directories;
export const paymentDirectories = Object.keys(directories) as PaymentDirectory[];
export const pendingStatuses = ['PENDING_APPROVAL', 'APPROVED', 'SUBMITTED', 'PROCESSING', 'SUBMISSION_UNKNOWN', 'PARTIALLY_SETTLED'];
export const failedStatuses = ['FAILED', 'REJECTED'];

export interface PaymentFilters {
  companyId?: number;
  providerId?: string;
  status?: string;
  from?: string;
  to?: string;
  incident?: 'pending' | 'failed';
}

interface PaymentPage extends PaymentFilters {
  page: number;
  limit: number;
}

const dateFilter = ({ from, to }: PaymentFilters) => ({
  ...(from ? { [Op.gte]: new Date(from + 'T00:00:00+01:00') } : {}),
  ...(to ? { [Op.lte]: new Date(to + 'T23:59:59.999+01:00') } : {}),
});
const hasDates = (filters: PaymentFilters) => Boolean(filters.from || filters.to);
const companyFilter = ({ companyId }: PaymentFilters) => companyId ? { companyId } : {};

function directoryWhere(view: PaymentDirectory, filters: PaymentFilters): WhereOptions {
  const directory: Directory = directories[view];
  const statuses = filters.incident === 'pending' ? pendingStatuses : failedStatuses;
  const status = filters.incident
    ? { [Op.in]: filters.status ? statuses.filter(value => value === filters.status) : statuses }
    : filters.status;
  return {
    ...companyFilter(filters),
    ...(hasDates(filters) ? { [directory.date ?? 'createdAt']: dateFilter(filters) } : {}),
    ...(status && directory.fields.includes('status') ? { status } : {}),
    ...(filters.providerId && directory.fields.includes('providerId') ? { providerId: filters.providerId } : {}),
    ...(view === 'audit' ? { action: { [Op.like]: 'payments.%' } } : {}),
  };
}

async function companyNames(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const ids = [...new Set(rows.map(row => row.companyId).filter((id): id is number => typeof id === 'number'))];
  if (!ids.length) return rows;
  const companies = await CompanyModel.findAll({ attributes: ['id', 'name'], where: { id: ids } });
  const names = new Map(companies.map(row => [row.id, row.name]));
  return rows.map(row => ({ ...row, companyName: names.get(row.companyId as number) ?? null }));
}

function plain(row: Model): Record<string, unknown> {
  const data = row.get({ plain: true }) as Record<string, unknown>;
  if (typeof data.providerReference === 'string') {
    data.providerReference = '••••' + (data.providerReference.length > 4 ? data.providerReference.slice(-4) : '');
  }
  return data;
}

function projection(directory: Directory) {
  return ['id', 'companyId', 'createdAt', ...(directory.date ? [directory.date] : []), ...directory.fields];
}

export async function listPlatformPayments(view: PaymentDirectory, filters: PaymentPage) {
  const directory: Directory = directories[view];
  const { count, rows } = await directory.model.findAndCountAll({
    attributes: projection(directory),
    where: directoryWhere(view, filters),
    order: [[directory.date ?? 'createdAt', 'DESC'], ['id', 'DESC']],
    limit: filters.limit,
    offset: (filters.page - 1) * filters.limit,
  });
  return { items: await companyNames(rows.map(plain)), total: count, page: filters.page, limit: filters.limit };
}

export async function platformPaymentDetail(view: PaymentDirectory, id: string) {
  const directory: Directory = directories[view];
  const row = await directory.model.findOne({
    attributes: projection(directory), where: { ...directoryWhere(view, {}), id },
  });
  if (!row) return null;
  const [record] = await companyNames([plain(row)]);
  const companyId = row.get('companyId') as number | null;
  if (view === 'orders') {
    const attempts = await PayrollPaymentAttemptModel.findAndCountAll({
      attributes: ['id', 'attemptNumber', 'status', 'providerReference', 'responseCode', 'errorCode', 'startedAt', 'completedAt'],
      where: { companyId, orderId: id }, order: [['attemptNumber', 'DESC']], limit: 50,
    });
    return { record, history: attempts.rows.map(plain), historyTotal: attempts.count };
  }
  if (view === 'batches') {
    const items = await PayrollPaymentBatchItemModel.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      where: { companyId, batchId: id }, group: ['status'], raw: true,
    });
    return { record, progress: items };
  }
  if (view === 'instructions') {
    const events = await AuditLogModel.findAndCountAll({
      attributes: ['id', 'action', 'actorUserId', 'createdAt'],
      where: { companyId, entityType: 'payment_instruction', entityId: id, action: { [Op.like]: 'payments.%' } },
      order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 50,
    });
    return { record, history: events.rows.map(plain), historyTotal: events.count };
  }
  if (view === 'integrations') {
    const orders = await PayrollPaymentOrderModel.findAll({
      attributes: ['id'], where: { companyId, providerId: record.providerId },
      order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 50,
    });
    if (!orders.length) return { record, history: [], historyTotal: 0 };
    const attempts = await PayrollPaymentAttemptModel.findAndCountAll({
      attributes: ['id', 'attemptNumber', 'orderId', 'status', 'responseCode', 'errorCode', 'startedAt', 'completedAt'],
      where: { companyId, orderId: orders.map(order => order.get('id')) },
      order: [['startedAt', 'DESC'], ['id', 'DESC']], limit: 50,
    });
    return { record, history: attempts.rows.map(plain), historyTotal: attempts.count };
  }
  return { record };
}

type Breakdown = 'status' | 'company' | 'provider';
export async function paymentVolume(filters: PaymentPage, breakdown: Breakdown) {
  const dimension = { status: 'status', company: 'companyId', provider: 'providerId' }[breakdown];
  const view = breakdown === 'provider' ? 'orders' : 'instructions';
  const rows = await directories[view].model.findAll({
    attributes: [dimension, 'currency', [fn('COUNT', col('id')), 'count'], [fn('SUM', col('amount')), 'amount']],
    where: directoryWhere(view, filters), group: [dimension, 'currency'],
    order: [[dimension, 'ASC'], ['currency', 'ASC']],
    limit: filters.limit + 1, offset: (filters.page - 1) * filters.limit, raw: true,
  }) as unknown as Record<string, unknown>[];
  const page = rows.slice(0, filters.limit).map(row => ({
    ...row, count: Number(row.count), amount: typeof row.amount === 'number' ? row.amount.toFixed(2) : String(row.amount),
  }));
  return { items: await companyNames(page), page: filters.page, hasNext: rows.length > filters.limit };
}

export async function platformPaymentOverview(filters: PaymentFilters) {
  const statusCount = (statuses: string[]) => PayrollPaymentInstructionModel.count({
    where: { ...directoryWhere('instructions', filters), status: { [Op.in]: statuses } },
  });
  const [totals, confirmed, pending, failed, returns, companies, batches, reconciliations] = await Promise.all([
    PayrollPaymentInstructionModel.findAll({
      attributes: ['currency', [fn('SUM', col('amount')), 'amount']],
      where: { ...directoryWhere('instructions', filters), status: { [Op.notIn]: ['CANCELLED', 'REJECTED'] } },
      group: ['currency'], order: [['currency', 'ASC']], raw: true,
    }) as unknown as Promise<{ currency: string; amount: string | number }[]>,
    statusCount(['SETTLED', 'RECONCILED']),
    statusCount(pendingStatuses),
    statusCount(failedStatuses),
    PayrollPaymentReturnModel.count({ where: directoryWhere('returns', filters) }),
    PayrollPaymentInstructionModel.count({ distinct: true, col: 'companyId', where: directoryWhere('instructions', filters) }),
    PayrollPaymentBatchModel.count({ where: { ...directoryWhere('batches', filters), status: { [Op.in]: ['SUBMITTED', 'PROCESSING', 'SUBMISSION_UNKNOWN', 'PARTIALLY_SETTLED'] } } }),
    PayrollPaymentReconciliationModel.count({ where: { ...directoryWhere('reconciliations', filters), status: { [Op.in]: ['PENDING', 'RECONCILIATION_EXCEPTION'] } } }),
  ]);
  return {
    totals: totals.map(row => ({ currency: row.currency, amount: typeof row.amount === 'number' ? row.amount.toFixed(2) : row.amount })),
    confirmed, pending, failed, returns, companies, batches, reconciliations,
  };
}
