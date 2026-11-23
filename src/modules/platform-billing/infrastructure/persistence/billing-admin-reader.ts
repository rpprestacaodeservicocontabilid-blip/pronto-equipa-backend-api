import { col, fn, literal, Op, where, WhereOptions } from 'sequelize';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import { resolveRecordTransaction } from '../../../../shared/infrastructure/persistence/sequelize-record-store';
import { BillingRecord } from './models/billing-record.model';
import { SequelizeBillingStore } from './repositories/sequelize-billing-store';
import { BillingRecordView } from '../../application/ports/billing-store.port';

export const billingKinds = [
  'ACCOUNT', 'ACCOUNT_HISTORY', 'INVOICE', 'PAYMENT', 'PAYMENT_ALLOCATION', 'RECEIPT', 'CREDIT_NOTE', 'REFUND',
  'STATEMENT', 'BANK_ENTRY', 'RECONCILIATION', 'SCHEDULE', 'OUTBOX', 'TAX_RULE', 'SERIES', 'AUDIT',
] as const;
export type BillingKind = typeof billingKinds[number];
type Company = { id: number; name: string; nif: string | null };
type Marker = { createdAt: string; id: string };
type Filters = { companyId?: number; status?: string; reference?: string; from?: string; to?: string; currency?: string; debit?: boolean; recurring?: boolean; overdue?: boolean; unallocated?: boolean };
const segments = {
  ACCOUNT: ['name', 'taxId', 'email', 'address'], ACCOUNT_HISTORY: ['name', 'taxId', 'email', 'address'],
  INVOICE: ['number', 'issuedAt', 'dueAt', 'currency', 'total', 'paid', 'credited', 'net', 'tax', 'documentType', 'subscriptionId', 'periodId', 'originalInvoiceId', 'createdBy', 'reason'],
  PAYMENT: ['invoiceId', 'amount', 'currency', 'provider', 'reference', 'requestedBy', 'confirmedBy', 'confirmedAt', 'allocated', 'type'],
  PAYMENT_ALLOCATION: ['paymentId', 'invoiceId', 'amount', 'currency', 'actor'],
  RECEIPT: ['number', 'issuedAt', 'amount', 'currency', 'invoiceId', 'paymentId'],
  CREDIT_NOTE: ['number', 'issuedAt', 'amount', 'currency', 'invoiceId', 'originalNumber', 'createdBy'],
  REFUND: ['paymentId', 'amount', 'currency', 'reason', 'requestedBy', 'approvedBy', 'executedBy', 'completedAt'],
  STATEMENT: ['count', 'importedBy'],
  BANK_ENTRY: ['reference', 'occurredAt', 'amount', 'currency', 'paymentId', 'reconciliationId', 'reviewReason', 'reviewedBy', 'reviewedAt'],
  RECONCILIATION: ['entryId', 'paymentId', 'actor', 'amount', 'currency', 'reversalReason', 'reversedBy', 'reversedAt'],
  SCHEDULE: ['nextAt', 'automatic', 'createdBy'],
  OUTBOX: ['event', 'attempts', 'invoiceId', 'paymentId', 'nextAttemptAt'],
  TAX_RULE: ['version', 'basisPoints', 'validFrom', 'validUntil', 'legalReference', 'createdBy'],
  SERIES: ['documentType', 'prefix', 'counter', 'validationReference', 'createdBy'],
  AUDIT: ['actor', 'event', 'invoiceId', 'paymentId', 'entryId', 'id', 'approve', 'reason'],
} satisfies Record<BillingKind, string[]>;

function project(record: BillingRecordView, company: Company, detail = false) {
  const kind = record.kind as BillingKind;
  const data = Object.fromEntries(segments[kind].map(field => [field, record.data[field]]));
  if (kind === 'SCHEDULE') {
    const input = record.data.input ?? {};
    Object.assign(data, { subscriptionId: input.subscriptionId, currency: input.currency, intervalMonths: input.intervalMonths, dueDays: input.dueDays });
  }
  if (detail) {
    if (kind === 'INVOICE' || kind === 'SCHEDULE') data.lines = (kind === 'INVOICE' ? record.data.lines : record.data.input?.lines) ?? [];
    if (['REFUND', 'PAYMENT'].includes(kind)) data.evidence = record.data.evidence;
    if (kind === 'SERIES') data.issuer = record.data.issuer;
    if (kind === 'CREDIT_NOTE') data.reason = record.data.request?.reason;
  }
  return { id: record.id, companyId: company.id, companyName: company.name, kind, key: record.key,
    status: record.status, createdAt: new Date(record.createdAt ?? 0).toISOString(), updatedAt: record.updatedAt, data };
}

const dateWhere = (filters: Filters) => ({
  ...(filters.from ? { [Op.gte]: new Date(filters.from + 'T00:00:00+01:00') } : {}),
  ...(filters.to ? { [Op.lte]: new Date(filters.to + 'T23:59:59.999+01:00') } : {}),
});
function scope(kind: BillingKind, filters: Filters, before?: Marker): WhereOptions {
  const conditions: WhereOptions[] = [];
  const billingField = {
    number: literal("(data->>'number')"),
    reference: literal("(data->>'reference')"),
    currency: literal("(data->>'currency')"),
    documentType: literal("(data->>'documentType')"),
    dueAt: literal("(data->>'dueAt')"),
  };
  if (filters.reference) {
    const reference = filters.reference.toLowerCase();
    // Use a substring test so wildcard characters have no special meaning.
    const search = (column: ReturnType<typeof col> | ReturnType<typeof literal>) =>
      where(fn('replace', fn('lower', column), reference, ''), { [Op.ne]: fn('lower', column) });
    conditions.push({ [Op.or]: [search(col('key')), search(billingField.number), search(billingField.reference)] });
  }
  if (filters.currency) conditions.push(where(billingField.currency, filters.currency));
  if (filters.debit) conditions.push(where(billingField.documentType, 'DEBIT_NOTE'));
  if (filters.recurring) conditions.push({ key: { [Op.like]: 'cycle:%' } });
  if (filters.unallocated && kind === 'PAYMENT') {
    conditions.push({ status: 'CONFIRMED' });
    conditions.push(literal("NULLIF(data->>'invoiceId','') IS NULL"));
    conditions.push(literal("CAST(data->>'amount' AS NUMERIC) > COALESCE(CAST(data->>'allocated' AS NUMERIC),0)"));
  }
  if (filters.overdue && kind === 'INVOICE') {
    conditions.push({ status: { [Op.in]: ['ISSUED', 'PARTIALLY_PAID'] } });
    conditions.push(where(billingField.dueAt, { [Op.lt]: new Date().toISOString() }));
    conditions.push(literal("CAST(data->>'total' AS NUMERIC) > COALESCE(CAST(data->>'paid' AS NUMERIC),0) + COALESCE(CAST(data->>'credited' AS NUMERIC),0)"));
  }
  if (filters.from || filters.to) conditions.push({ createdAt: dateWhere(filters) });
  if (before) {
    const createdAt = new Date(before.createdAt);
    conditions.push({ [Op.or]: [{ createdAt: { [Op.lt]: createdAt } }, { createdAt, id: { [Op.lt]: before.id } }] });
  }
  return { kind, ...(filters.status ? { status: filters.status } : {}), [Op.and]: conditions };
}

export class BillingAdminReader {
  constructor(private readonly store: SequelizeBillingStore) {}

  private async companies(companyId?: number, search?: string): Promise<Company[]> {
    return CompanyModel.findAll({
      attributes: ['id', 'name', 'nif'],
      where: {
        ...(companyId ? { id: companyId } : {}),
        ...(search ? { [Op.or]: [
          where(fn('replace', fn('lower', col('name')), search.toLowerCase(), ''), { [Op.ne]: fn('lower', col('name')) }),
          where(fn('replace', fn('lower', col('nif')), search.toLowerCase(), ''), { [Op.ne]: fn('lower', col('nif')) }),
        ] } : {}),
      },
      order: [['id', 'ASC']], raw: true,
    });
  }

  async records(kind: BillingKind, filters: Filters, limit: number, before?: Marker) {
    const filter = scope(kind, filters, before);
    let candidates: ReturnType<typeof project>[] = [];
    for (const company of await this.companies(filters.companyId)) {
      const rows = await this.store.transaction(company.id, async context =>
        BillingRecord.findAll({ where: { companyId: company.id, ...filter },
          order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: limit + 1, transaction: resolveRecordTransaction(context),
        }));
      candidates = [...candidates, ...rows.map(row => project(row.toJSON(), company))]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
        .slice(0, limit + 1);
    }
    const items = candidates.slice(0, limit);
    const tail = items[items.length - 1];
    const next = candidates.length > limit && tail ? { id: tail.id, createdAt: tail.createdAt } : null;
    return { items, next };
  }

  async detail(companyId: number, kind: BillingKind, id: string, overdue = false) {
    const [company] = await this.companies(companyId);
    if (!company) return null;
    return this.store.transaction(companyId, async transaction => {
      const row = await this.store.findOne({ where: { id, companyId, kind }, transaction });
      if (!row) return null;
      if (overdue && (kind !== 'INVOICE' || !['ISSUED', 'PARTIALLY_PAID'].includes(row.status) ||
        !(Date.parse(row.data.dueAt) < Date.now()) || minor(row.data.total) <= minor(row.data.paid) + minor(row.data.credited))) return null;
      const result = project(row, company, true);
      if (kind === 'PAYMENT' && row.status === 'CONFIRMED') {
        const applied = row.data.invoiceId ? minor(row.data.amount) : minor(row.data.allocated);
        result.data.allocated = decimal(applied);
        if (!row.data.invoiceId) {
          const refunds = await this.store.findAll({
            where: { companyId, kind: 'REFUND', 'data.paymentId': row.id, status: { $ne: 'REJECTED' } }, transaction,
          });
          const reserved = refunds.reduce((sum, refund) => sum + minor(refund.data.amount), zero);
          result.data.availableToAllocate = decimal(positive(minor(row.data.amount) - applied - reserved));
        }
      }
      return result;
    });
  }

  async accounts(companyId?: number, search?: string) {
    return this.summarize(await this.companies(companyId, search), true);
  }

  async overview(companyId?: number) {
    return this.summarize(await this.companies(companyId), false);
  }

  private async summarize(companies: Company[], byCompany: boolean) {
    const now = new Date();
    const current = monthInLuanda(now);
    const months = Array.from({ length: 6 }, (_, index) => new Date(
      Date.UTC(Number(current.slice(0, 4)), Number(current.slice(5, 7)) - 6 + index, 1),
    ).toISOString().slice(0, 7));
    const totals = new Map<string, Totals>();
    const providers = new Map<string, { provider: string; currency: string; count: number; confirmed: bigint }>();
    const accounts: { company: Company; balances: ReturnType<typeof publicTotals>[]; invoices: number; overdue: number }[] = [];
    const invoiceStatuses: Record<string, number> = {};
    const alerts = { overdue: 0, pendingPayments: 0, failedEvents: 0, unmatched: 0 };
    for (const company of companies) {
      const balances = new Map<string, Totals>();
      let invoices = 0;
      let overdue = 0;
      await this.store.transaction(company.id, async transaction => {
        const kinds = byCompany ? ['INVOICE', 'PAYMENT', 'REFUND'] : ['INVOICE', 'PAYMENT', 'REFUND', 'CREDIT_NOTE', 'OUTBOX', 'BANK_ENTRY'];
        const unallocated = new Map<string, { currency: string; balance: bigint }>();
        const reserves = new Map<string, bigint>();
        const where = { companyId: company.id, kind: { $in: kinds } };
        const size = 250;
        for (let offset = 0; ; offset += size) {
          const records = await this.store.findAll({ where, order: [['id', 'ASC']], limit: size, offset, transaction });
          for (const record of records) {
            const data = record.data;
            const currency = typeof data.currency === 'string' && /^[A-Z]{3}$/.test(data.currency) ? data.currency : undefined;
            if (record.kind === 'INVOICE') {
              invoices++;
              invoiceStatuses[record.status] = (invoiceStatuses[record.status] ?? 0) + 1;
              if (['DRAFT', 'CANCELLED', 'VOID'].includes(record.status) || !currency) continue;
              const total = minor(data.total);
              const paid = minor(data.paid);
              const outstanding = positive(total - minor(data.credited) - paid);
              const due = new Date(data.dueAt).getTime();
              const late = outstanding > zero && Number.isFinite(due) && due < +now;
              if (late) { overdue++; alerts.overdue++; }
              const index = months.indexOf(monthInLuanda(new Date(data.issuedAt ?? record.createdAt)));
              for (const target of [metric(totals, currency, 6), metric(balances, currency, 6)]) {
                target.invoiced += total;
                target.paid += paid;
                target.outstanding += outstanding;
                if (index >= 0) target.trend[index].invoiced += total;
                const days = late ? Math.ceil((+now - due) / 86400000) : 0;
                target.ageing[days === 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4] += outstanding;
              }
              continue;
            }
            if (record.kind === 'OUTBOX' && record.status === 'DEAD') alerts.failedEvents++;
            if (record.kind === 'BANK_ENTRY' && ['UNMATCHED', 'DISPUTED'].includes(record.status)) alerts.unmatched++;
            if (record.kind === 'PAYMENT' && record.status === 'PENDING') alerts.pendingPayments++;
            if (!currency) continue;
            if (record.kind === 'REFUND' && record.status !== 'REJECTED') {
              const paymentId = String(data.paymentId);
              reserves.set(paymentId, (reserves.get(paymentId) ?? zero) + minor(data.amount));
            }
            if (record.kind === 'PAYMENT' && record.status === 'CONFIRMED' && !data.invoiceId)
              unallocated.set(record.id, { currency, balance: positive(minor(data.amount) - minor(data.allocated)) });
            if (byCompany) continue;
            const target = metric(totals, currency, 6);
            if (record.kind === 'CREDIT_NOTE' && record.status === 'ISSUED') target.credits += minor(data.amount);
            if (record.kind === 'REFUND' && record.status === 'COMPLETED') target.refunded += minor(data.amount);
            if (record.kind === 'PAYMENT' && record.status === 'CONFIRMED') {
              const amount = minor(data.amount);
              const index = months.indexOf(monthInLuanda(new Date(data.confirmedAt ?? record.updatedAt)));
              target.received += amount;
              if (index >= 0) target.trend[index].received += amount;
              const provider = String(data.provider || 'Unknown');
              const key = JSON.stringify([provider, currency]);
              const entry = providers.get(key) ?? { provider, currency, count: 0, confirmed: zero };
              entry.count++;
              entry.confirmed += amount;
              providers.set(key, entry);
            }
          }
          if (records.length < size) break;
        }
        for (const [paymentId, entry] of unallocated) {
          const target = metric(byCompany ? balances : totals, entry.currency, 6);
          target.unapplied += positive(entry.balance - (reserves.get(paymentId) ?? zero));
        }
      });
      if (byCompany) accounts.push({ company, balances: [...balances.values()].map(publicTotals), invoices, overdue });
    }
    return {
      months, totals: [...totals.values()].map(publicTotals), invoiceStatuses, alerts, accounts,
      providers: [...providers.values()].map(row => ({ ...row, confirmed: decimal(row.confirmed) })),
    };
  }
}

interface Totals {
  currency: string;
  invoiced: bigint;
  paid: bigint;
  outstanding: bigint;
  received: bigint;
  credits: bigint;
  refunded: bigint;
  unapplied: bigint;
  trend: { invoiced: bigint; received: bigint }[];
  ageing: bigint[];
}
const zero = BigInt(0);
const scale = BigInt(100);
function metric(map: Map<string, Totals>, currency: string, months: number): Totals {
  const previous = map.get(currency);
  if (previous) return previous;
  const total = { currency, invoiced: zero, paid: zero, outstanding: zero, received: zero, credits: zero, refunded: zero, unapplied: zero,
    trend: Array.from({ length: months }, () => ({ invoiced: zero, received: zero })), ageing: Array<bigint>(5).fill(zero) };
  map.set(currency, total);
  return total;
}
const positive = (value: bigint) => value > zero ? value : zero;
function minor(value: unknown): bigint {
  const [whole, fraction = ''] = /^\d{1,24}(\.\d{1,2})?$/.test(String(value)) ? String(value).split('.') : ['0'];
  return BigInt(whole) * scale + BigInt(fraction.padEnd(2, '0'));
}
const decimal = (value: bigint) => `${value / scale}.${String(value % scale).padStart(2, '0')}`;
const monthInLuanda = (date: Date) => Number.isFinite(date.getTime())
  ? new Date(+date + 3600000).toISOString().slice(0, 7) : '';
function publicTotals(total: Totals) {
  return {
    currency: total.currency, invoiced: decimal(total.invoiced), paid: decimal(total.paid), outstanding: decimal(total.outstanding),
    received: decimal(total.received), credits: decimal(total.credits), refunded: decimal(total.refunded), unapplied: decimal(total.unapplied),
    trend: total.trend.map(month => ({ invoiced: decimal(month.invoiced), received: decimal(month.received) })),
    ageing: total.ageing.map(decimal),
  };
}
