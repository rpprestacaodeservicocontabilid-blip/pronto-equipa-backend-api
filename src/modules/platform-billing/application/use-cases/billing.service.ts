import { randomUUID, createHash } from 'crypto';
import { RecordStoreContext } from '../../../../shared/application/ports/record-store.port';
import { BillingStorePort } from '../ports/billing-store.port';
import {
  amount,
  cents,
  calculate,
  BillingLine,
  billingError,
} from '../../domain/billing-calculation';
export class BillingService {
  constructor(protected readonly store: BillingStorePort) {}
  protected async numberDocument(companyId: number, type: string, tx: RecordStoreContext) {
    const series = await this.store.findOne({
      where: { companyId, kind: 'SERIES', key: type },
      transaction: tx,
      forUpdate: true,
    });
    if (!series) throw billingError(`Configure uma série validada para ${type}.`);
    const counter = Number(series.data.counter || 0) + 1;
    if (!Number.isSafeInteger(counter)) throw billingError('Série esgotada.');
    await this.store.update(series, { data: { ...series.data, counter } }, { transaction: tx });
    return {
      number: `${series.data.prefix}/${companyId}/${counter}`,
      issuer: series.data.issuer,
      seriesType: type,
      validationReference: series.data.validationReference,
      issuedAt: new Date().toISOString(),
    };
  }
  protected async transaction<T>(
    companyId: number,
    operation: (tx: RecordStoreContext) => Promise<T>,
  ) {
    return this.store.transaction(companyId, operation);
  }
  protected create(
    companyId: number,
    kind: string,
    key: string,
    status: string,
    data: Record<string, any>,
    tx: RecordStoreContext,
  ) {
    return this.store.create(
      { id: randomUUID(), companyId, kind, key, status, data },
      { transaction: tx },
    );
  }
  protected async get(companyId: number, id: string, kind: string, tx: RecordStoreContext) {
    const row = await this.store.findOne({
      where: { companyId, id, kind },
      transaction: tx,
      forUpdate: true,
    });
    if (!row) throw billingError('Registo não encontrado.', 404);
    return row;
  }
  protected async event(
    companyId: number,
    actor: number,
    event: string,
    data: any,
    tx: RecordStoreContext,
  ) {
    await this.create(companyId, 'AUDIT', randomUUID(), 'RECORDED', { actor, event, ...data }, tx);
    await this.create(
      companyId,
      'OUTBOX',
      randomUUID(),
      'PENDING',
      { event, ...data, attempts: 0 },
      tx,
    );
  }
  list(companyId: number, kind: string) {
    return this.transaction(companyId, (tx) =>
      this.store.findAll({
        where: { companyId, kind },
        order: [['createdAt', 'DESC']],
        limit: 200,
        transaction: tx,
      }),
    );
  }
  account(companyId: number, actor: number, input: any) {
    return this.transaction(companyId, async (tx) => {
      let row = await this.store.findOne({
        where: { companyId, kind: 'ACCOUNT', key: 'current' },
        transaction: tx,
      });
      if (row) {
        await this.create(companyId, 'ACCOUNT_HISTORY', randomUUID(), 'RECORDED', row.data, tx);
        await this.store.update(row, { data: input }, { transaction: tx });
      } else row = await this.create(companyId, 'ACCOUNT', 'current', 'ACTIVE', input, tx);
      await this.event(companyId, actor, 'platform-billing.account.updated', { id: row.id }, tx);
      return row;
    });
  }
  draft(
    companyId: number,
    actor: number,
    input: {
      operationKey: string;
      currency: string;
      dueAt: string;
      lines: BillingLine[];
      subscriptionId?: string;
      periodId?: string;
    },
  ) {
    return this.transaction(companyId, async (tx) => {
      const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const old = await this.store.findOne({
        where: { companyId, kind: 'INVOICE', key: input.operationKey },
        transaction: tx,
      });
      if (old) {
        if (old.data.hash !== hash)
          throw billingError('Chave de idempotência reutilizada com outros dados.', 409);
        return old;
      }
      const row = await this.create(
        companyId,
        'INVOICE',
        input.operationKey,
        'DRAFT',
        {
          ...input,
          ...calculate(input.lines),
          paid: '0.00',
          credited: '0.00',
          hash,
          createdBy: actor,
        },
        tx,
      );
      await this.event(
        companyId,
        actor,
        'platform-billing.invoice.created',
        { invoiceId: row.id },
        tx,
      );
      return row;
    });
  }
  issue(companyId: number, actor: number, id: string) {
    return this.transaction(companyId, async (tx) => {
      const invoice = await this.get(companyId, id, 'INVOICE', tx);
      if (invoice.status !== 'DRAFT') return invoice;
      const account = await this.store.findOne({
        where: { companyId, kind: 'ACCOUNT', key: 'current' },
        transaction: tx,
      });
      if (!account) throw billingError('Configure os dados fiscais da conta.');
      const numbered = await this.numberDocument(
        companyId,
        invoice.data.documentType === 'DEBIT_NOTE' ? 'ND' : 'FT',
        tx,
      );
      const snapshot = { ...invoice.data, buyer: account.data, ...numbered };
      await this.store.update(
        invoice,
        {
          status: 'ISSUED',
          data: {
            ...snapshot,
            documentHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
          },
        },
        { transaction: tx },
      );
      await this.event(
        companyId,
        actor,
        'platform-billing.invoice.issued',
        { invoiceId: id, ...snapshot },
        tx,
      );
      return invoice;
    });
  }
  configureSeries(companyId: number, actor: number, data: any) {
    return this.transaction(companyId, async (tx) => {
      const type = data.documentType || 'FT';
      const old = await this.store.findOne({
        where: { companyId, kind: 'SERIES', key: type },
        transaction: tx,
      });
      if (old) throw billingError('A série já existe e é imutável.', 409);
      const row = await this.create(
        companyId,
        'SERIES',
        type,
        'ACTIVE',
        { ...data, counter: 0, createdBy: actor },
        tx,
      );
      await this.event(companyId, actor, 'platform-billing.series.created', { id: row.id }, tx);
      return row;
    });
  }
  payment(companyId: number, actor: number, input: any) {
    return this.transaction(companyId, async (tx) => {
      const key = `${input.provider}:${input.reference}`;
      const old = await this.store.findOne({
        where: { companyId, kind: 'PAYMENT', key },
        transaction: tx,
      });
      if (old) {
        if (old.data.amount !== input.amount || old.data.invoiceId !== input.invoiceId)
          throw billingError('Referência já utilizada.', 409);
        return old;
      }
      cents(input.amount);
      return this.create(
        companyId,
        'PAYMENT',
        key,
        'PENDING',
        { ...input, requestedBy: actor },
        tx,
      );
    });
  }
  confirm(companyId: number, actor: number, id: string, evidence: string) {
    return this.transaction(companyId, async (tx) => {
      const payment = await this.get(companyId, id, 'PAYMENT', tx);
      if (payment.status === 'CONFIRMED') return payment;
      if (payment.data.requestedBy === actor)
        throw billingError('A confirmação exige outro utilizador.', 403);
      const invoice = await this.get(companyId, payment.data.invoiceId, 'INVOICE', tx);
      if (!['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status))
        throw billingError('Factura não disponível para liquidação.');
      if (payment.data.currency !== invoice.data.currency)
        throw billingError('Moedas incompatíveis.');
      const paid = cents(invoice.data.paid) + cents(payment.data.amount),
        total = cents(invoice.data.total) - cents(invoice.data.credited);
      if (paid > total) throw billingError('Pagamento superior ao saldo.');
      await this.store.update(
        invoice,
        {
          status: paid === total ? 'PAID' : 'PARTIALLY_PAID',
          data: { ...invoice.data, paid: amount(paid) },
        },
        { transaction: tx },
      );
      await this.store.update(
        payment,
        { status: 'CONFIRMED', data: { ...payment.data, confirmedBy: actor, evidence } },
        { transaction: tx },
      );
      const receipt = {
        ...(await this.numberDocument(companyId, 'RC', tx)),
        buyer: invoice.data.buyer,
        paymentId: id,
        invoiceId: invoice.id,
        amount: payment.data.amount,
        currency: payment.data.currency,
      };
      await this.create(
        companyId,
        'RECEIPT',
        id,
        'ISSUED',
        {
          ...receipt,
          documentHash: createHash('sha256').update(JSON.stringify(receipt)).digest('hex'),
        },
        tx,
      );
      await this.event(
        companyId,
        actor,
        'platform-billing.payment.confirmed',
        {
          paymentId: id,
          invoiceId: invoice.id,
          subscriptionId: invoice.data.subscriptionId,
          periodId: invoice.data.periodId,
          settled: paid === total,
        },
        tx,
      );
      return payment;
    });
  }
  balance(companyId: number) {
    return this.transaction(companyId, async (tx) => {
      const invoices = await this.store.findAll({
        where: { companyId, kind: 'INVOICE' },
        transaction: tx,
      });
      const currencies: Record<string, { invoiced: string; paid: string; outstanding: string }> =
        {};
      for (const row of invoices.filter((r) => r.status !== 'DRAFT')) {
        const d = row.data,
          prior = currencies[d.currency] || { invoiced: '0.00', paid: '0.00', outstanding: '0.00' };
        const total = cents(d.total) - cents(d.credited);
        currencies[d.currency] = {
          invoiced: amount(cents(prior.invoiced) + total),
          paid: amount(cents(prior.paid) + cents(d.paid)),
          outstanding: amount(cents(prior.outstanding) + total - cents(d.paid)),
        };
      }
      return currencies;
    });
  }
}
