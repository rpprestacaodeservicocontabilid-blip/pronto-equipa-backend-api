import { BillingOperationsService } from './billing-operations.service';

import { BillingLine, cents, billingError } from '../../domain/billing-calculation';
import { BillingStorePort, BillingDocumentRendererPort } from '../ports/billing-store.port';
export class BillingCommercialService extends BillingOperationsService {
  constructor(
    store: BillingStorePort,
    private readonly renderer: BillingDocumentRendererPort,
    private readonly policy: { subscriptionTaxVersion?: string },
  ) {
    super(store);
  }
  async confirmProvider(input: {
    companyId: number;
    paymentId: string;
    reference: string;
    provider: string;
    amount: string;
    currency: string;
  }) {
    await this.transaction(input.companyId, async (tx) => {
      const payment = await this.get(input.companyId, input.paymentId, 'PAYMENT', tx);
      if (
        payment.data.provider !== input.provider ||
        payment.data.reference !== input.reference ||
        payment.data.currency !== input.currency ||
        cents(payment.data.amount) !== cents(input.amount)
      )
        throw billingError('Confirmação do prestador incompatível com o pagamento.', 409);
    });
    return this.confirm(
      input.companyId,
      0,
      input.paymentId,
      `provider:${input.provider}:${input.reference}`,
    );
  }
  async syncContract(companyId: number, sub: any) {
    return this.transaction(companyId, async (tx) => {
      const schedules = await this.store.findAll({
        where: { companyId, kind: 'SCHEDULE' },
        transaction: tx,
      });
      for (const row of schedules) {
        if (
          row.data.automatic &&
          (!sub ||
            row.data.input.subscriptionId !== sub.id ||
            sub.cancelAtPeriodEnd ||
            !['ACTIVE', 'PENDING_PAYMENT'].includes(sub.status))
        )
          await this.store.update(row, { status: 'CANCELLED' }, { transaction: tx });
      }
      if (!sub || sub.cancelAtPeriodEnd || !['ACTIVE', 'PENDING_PAYMENT'].includes(sub.status))
        return;
      const ruleKey = this.policy.subscriptionTaxVersion;
      if (!ruleKey) throw billingError('Configure a versão fiscal das subscrições.');
      const rule = await this.store.findOne({
        where: { companyId, kind: 'TAX_RULE', key: ruleKey, status: 'ACTIVE' },
        transaction: tx,
      });
      if (!rule) throw billingError('Versão fiscal das subscrições inexistente.');
      const months: Record<string, number> = {
        MONTHLY: 1,
        QUARTERLY: 3,
        SEMIANNUAL: 6,
        ANNUAL: 12,
      };
      const interval = sub.pendingInterval || sub.interval;
      if (!months[interval]) throw billingError('Periodicidade automática não suportada.');
      const { price } = sub;
      if (!price || cents(price.amount) === BigInt(0)) return;
      const key = `contract:${sub.id}`,
        nextAt = sub.status === 'PENDING_PAYMENT' ? sub.startedAt : sub.currentPeriodEnd;
      const input = {
        operationKey: key,
        subscriptionId: sub.id,
        currency: price.currency,
        nextAt,
        intervalMonths: months[interval],
        dueDays: 7,
        lines: [
          {
            description: 'Subscrição PRONTOEQUIPAS',
            quantity: 1,
            unitPrice: price.amount,
            discount: '0.00',
            taxBasisPoints: rule.data.basisPoints,
            taxRuleVersion: rule.key,
          },
        ],
      };
      const old = schedules.find((r) => r.key === key);
      if (old) {
        if (old.data.contractPeriod !== nextAt || old.status !== 'ACTIVE')
          await this.store.update(
            old,
            {
              status: 'ACTIVE',
              data: { ...old.data, input, nextAt, automatic: true, contractPeriod: nextAt },
            },
            { transaction: tx },
          );
      } else
        await this.create(
          companyId,
          'SCHEDULE',
          key,
          'ACTIVE',
          { input, nextAt, automatic: true, contractPeriod: nextAt, createdBy: 0 },
          tx,
        );
    });
  }
  cancelSchedule(companyId: number, actor: number, id: string) {
    return this.transaction(companyId, async (tx) => {
      const row = await this.get(companyId, id, 'SCHEDULE', tx);
      await this.store.update(row, { status: 'CANCELLED' }, { transaction: tx });
      await this.event(companyId, actor, 'platform-billing.schedule.cancelled', { id }, tx);
      return row;
    });
  }
  retryEvent(companyId: number, actor: number, id: string) {
    return this.transaction(companyId, async (tx) => {
      const row = await this.get(companyId, id, 'OUTBOX', tx);
      if (row.status !== 'DEAD')
        throw billingError('Apenas eventos esgotados podem ser reprocessados.');
      await this.store.update(
        row,
        { status: 'RETRY', data: { ...row.data, attempts: 0, nextAttemptAt: 0 } },
        { transaction: tx },
      );
      await this.event(companyId, actor, 'platform-billing.event.retried', { id }, tx);
      return row;
    });
  }
  fiscalRule(
    companyId: number,
    actor: number,
    input: {
      version: string;
      basisPoints: number;
      validFrom: string;
      validUntil: string;
      legalReference: string;
    },
  ) {
    return this.transaction(companyId, async (tx) => {
      if (new Date(input.validUntil) <= new Date(input.validFrom))
        throw billingError('Intervalo fiscal inválido.');
      const old = await this.store.findOne({
        where: { companyId, kind: 'TAX_RULE', key: input.version },
        transaction: tx,
      });
      if (old) throw billingError('Versão fiscal imutável.', 409);
      return this.create(
        companyId,
        'TAX_RULE',
        input.version,
        'ACTIVE',
        { ...input, createdBy: actor },
        tx,
      );
    });
  }
  async pdf(companyId: number, id: string, kind: string) {
    return this.transaction(companyId, async (tx) => {
      const row = await this.get(companyId, id, kind, tx);
      if (row.status === 'DRAFT') throw billingError('Documento não emitido.');
      return this.renderer.render(row.data, kind);
    });
  }
  schedule(
    companyId: number,
    actor: number,
    input: {
      operationKey: string;
      subscriptionId: string;
      currency: string;
      nextAt: string;
      intervalMonths: number;
      dueDays: number;
      lines: BillingLine[];
    },
  ) {
    return this.transaction(companyId, async (tx) => {
      const old = await this.store.findOne({
        where: { companyId, kind: 'SCHEDULE', key: input.operationKey },
        transaction: tx,
      });
      if (old) {
        if (JSON.stringify(old.data.input) !== JSON.stringify(input))
          throw billingError('Chave reutilizada.', 409);
        return old;
      }
      return this.create(
        companyId,
        'SCHEDULE',
        input.operationKey,
        'ACTIVE',
        { input, nextAt: input.nextAt, createdBy: actor },
        tx,
      );
    });
  }
  async runSchedules(companyId: number) {
    const rows = await this.list(companyId, 'SCHEDULE');
    for (const row of rows) {
      if (row.status !== 'ACTIVE' || row.data.nextAt > new Date().toISOString()) continue;
      const { input } = row.data,
        start = new Date(row.data.nextAt),
        next = new Date(start);
      const day = start.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + input.intervalMonths);
      const last = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
      ).getUTCDate();
      next.setUTCDate(Math.min(day, last));
      const due = new Date(start);
      due.setUTCDate(due.getUTCDate() + input.dueDays);
      const invoice = await this.draft(companyId, 0, {
        operationKey: `cycle:${row.id}:${start.toISOString()}`,
        currency: input.currency,
        dueAt: due.toISOString(),
        lines: input.lines,
        subscriptionId: input.subscriptionId,
      });
      await this.issue(companyId, 0, invoice.id);
      await this.transaction(companyId, async (tx) => {
        const current = await this.get(companyId, row.id, 'SCHEDULE', tx);
        if (current.data.nextAt === row.data.nextAt)
          await this.store.update(
            current,
            { data: { ...current.data, nextAt: next.toISOString() } },
            { transaction: tx },
          );
      });
    }
  }
  async debit(
    companyId: number,
    actor: number,
    input: { invoiceId: string; operationKey: string; reason: string; lines: BillingLine[] },
  ) {
    return this.transaction(companyId, async tx => {
      const original = await this.get(companyId, input.invoiceId, 'INVOICE', tx);
      if (!['ISSUED', 'PARTIALLY_PAID', 'PAID', 'CREDITED'].includes(original.status))
        throw billingError('Factura não emitida ou indisponível.');
      const draft = await this.draftInTransaction(companyId, actor, {
        operationKey: `debit:${input.operationKey}`, currency: original.data.currency,
        dueAt: original.data.dueAt, lines: input.lines, subscriptionId: original.data.subscriptionId,
      }, tx, { documentType: 'DEBIT_NOTE', originalInvoiceId: input.invoiceId, reason: input.reason });
      return this.issueInTransaction(companyId, actor, draft, tx);
    });
  }
  async overdue(companyId: number) {
    return this.transaction(companyId, async (tx) => {
      const rows = await this.store.findAll({
        where: { companyId, kind: 'INVOICE' },
        transaction: tx,
      });
      for (const row of rows) {
        if (
          !['ISSUED', 'PARTIALLY_PAID'].includes(row.status) ||
          row.data.dueAt >= new Date().toISOString() ||
          row.data.overdueNotifiedAt
        )
          continue;
        await this.event(
          companyId,
          0,
          'platform-billing.invoice.overdue',
          { invoiceId: row.id, subscriptionId: row.data.subscriptionId },
          tx,
        );
        await this.store.update(
          row,
          { data: { ...row.data, overdueNotifiedAt: new Date().toISOString() } },
          { transaction: tx },
        );
      }
    });
  }
}
