import { randomUUID, createHash } from 'crypto';
import { RecordStoreContext } from '../../../../shared/application/ports/record-store.port';
import { BillingRecordView, BillingStorePort } from '../ports/billing-store.port';
import {
  amount,
  cents,
  calculate,
  BillingLine,
  billingError,
} from '../../domain/billing-calculation';

interface DraftInvoiceInput {
  operationKey: string;
  currency: string;
  dueAt: string;
  lines: BillingLine[];
  subscriptionId?: string;
  periodId?: string;
}
type DebitAdjustment = { documentType: 'DEBIT_NOTE'; originalInvoiceId: string; reason: string };

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
  draft(companyId: number, actor: number, input: DraftInvoiceInput) {
    return this.transaction(companyId, tx => this.draftInTransaction(companyId, actor, input, tx));
  }
  protected async draftInTransaction(companyId: number, actor: number, input: DraftInvoiceInput,
    tx: RecordStoreContext, adjustment?: DebitAdjustment) {
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const old = await this.store.findOne({
      where: { companyId, kind: 'INVOICE', key: input.operationKey },
      transaction: tx,
    });
    if (old) {
      if (old.data.hash !== hash) throw billingError('Chave de idempotência reutilizada com outros dados.', 409);
      if (adjustment) {
        if (!old.data.documentType && old.status === 'DRAFT' && old.data.createdBy === actor) {
          await this.store.update(old, { data: { ...old.data, ...adjustment } }, { transaction: tx });
        } else if (old.data.documentType !== adjustment.documentType ||
          old.data.originalInvoiceId !== adjustment.originalInvoiceId || old.data.reason !== adjustment.reason) {
          throw billingError('Chave de idempotência reutilizada com outra rectificação.', 409);
        }
      }
      return old;
    }
    const row = await this.create(companyId, 'INVOICE', input.operationKey, 'DRAFT', {
      ...input, ...adjustment, ...calculate(input.lines), paid: '0.00', credited: '0.00', hash, createdBy: actor,
    }, tx);
    await this.event(companyId, actor, 'platform-billing.invoice.created', { invoiceId: row.id }, tx);
    return row;
  }
  private async invoiceIssueData(companyId: number, invoice: BillingRecordView, tx: RecordStoreContext) {
    const account = await this.store.findOne({
      where: { companyId, kind: 'ACCOUNT', key: 'current' }, transaction: tx,
    });
    if (!account) throw billingError('Configure os dados fiscais da conta.');
    const documentType = invoice.data.documentType === 'DEBIT_NOTE' ? 'ND' : 'FT';
    const series = await this.store.findOne({
      where: { companyId, kind: 'SERIES', key: documentType }, transaction: tx,
    });
    if (!series) throw billingError(`Configure uma série validada para ${documentType}.`);
    const now = new Date().toISOString();
    const checked = new Map<string, BillingRecordView | null>();
    for (const line of invoice.data.lines as BillingLine[]) {
      if (!checked.has(line.taxRuleVersion)) checked.set(line.taxRuleVersion, await this.store.findOne({
        where: { companyId, kind: 'TAX_RULE', key: line.taxRuleVersion, status: 'ACTIVE' }, transaction: tx,
      }));
      const rule = checked.get(line.taxRuleVersion);
      if (!rule || rule.data.basisPoints !== line.taxBasisPoints || rule.data.validFrom > now || rule.data.validUntil < now)
        throw billingError('Regra fiscal inexistente, expirada ou incompatível.');
    }
    return { buyer: account.data, documentType };
  }

  validateInvoice(companyId: number, id: string) {
    return this.transaction(companyId, async tx => {
      const invoice = await this.get(companyId, id, 'INVOICE', tx);
      if (invoice.status !== 'DRAFT') throw billingError('Apenas rascunhos podem ser validados.', 409);
      await this.invoiceIssueData(companyId, invoice, tx);
      return { ready: true };
    });
  }

  issue(companyId: number, actor: number, id: string) {
    return this.transaction(companyId, async tx => {
      const row = await this.get(companyId, id, 'INVOICE', tx);
      if (row.data.documentType === 'DEBIT_NOTE' || row.key.startsWith('debit:'))
        throw billingError('Utilize a emissão de notas de débito para este documento.', 409);
      return this.issueInTransaction(companyId, actor, row, tx);
    });
  }
  protected async issueInTransaction(companyId: number, actor: number, invoice: BillingRecordView, tx: RecordStoreContext) {
    if (invoice.status !== 'DRAFT') return invoice;
    const { buyer, documentType } = await this.invoiceIssueData(companyId, invoice, tx);
    const numbered = await this.numberDocument(companyId, documentType, tx);
    const snapshot = { ...invoice.data, buyer, ...numbered };
    await this.store.update(invoice, {
      status: 'ISSUED',
      data: { ...snapshot, documentHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') },
    }, { transaction: tx });
    await this.event(companyId, actor, 'platform-billing.invoice.issued', { invoiceId: invoice.id, ...snapshot }, tx);
    return invoice;
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
        if (cents(old.data.amount) !== cents(input.amount) || (old.data.invoiceId ?? null) !== (input.invoiceId ?? null) ||
          old.data.currency !== input.currency)
          throw billingError('Referência já utilizada.', 409);
        return old;
      }
      if (cents(input.amount) <= 0n) throw billingError('O recebimento deve ser positivo.');
      if (input.invoiceId) {
        const invoice = await this.get(companyId, input.invoiceId, 'INVOICE', tx);
        if (!['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status) || invoice.data.currency !== input.currency)
          throw billingError('Factura indisponível ou moeda incompatível.');
      }
      const payment = await this.create(
        companyId,
        'PAYMENT',
        key,
        'PENDING',
        { ...input, requestedBy: actor },
        tx,
      );
      await this.event(companyId, actor, 'platform-billing.payment.recorded', { paymentId: payment.id }, tx);
      return payment;
    });
  }
  protected refundReserved(companyId: number, paymentId: string, tx: RecordStoreContext) {
    return this.store.findAll({
      where: { companyId, kind: 'REFUND', 'data.paymentId': paymentId, status: { $ne: 'REJECTED' } },
      transaction: tx,
    }).then(rows => rows.reduce((sum, row) => sum + cents(row.data.amount), 0n));
  }

  private async applyPayment(companyId: number, actor: number, payment: BillingRecordView,
    invoice: BillingRecordView, value: bigint, operationKey: string, tx: RecordStoreContext) {
    if (!['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status))
      throw billingError('Factura não disponível para liquidação.');
    if (payment.data.currency !== invoice.data.currency)
      throw billingError('Moedas incompatíveis.');
    const paid = cents(invoice.data.paid) + value;
    const total = cents(invoice.data.total) - cents(invoice.data.credited);
    if (value <= 0n || paid > total) throw billingError('Aplicação superior ao saldo da factura ou inválida.');
    const settled = paid === total;
    await this.store.update(invoice, {
      status: settled ? 'PAID' : 'PARTIALLY_PAID', data: { ...invoice.data, paid: amount(paid) },
    }, { transaction: tx });
    const allocation = await this.create(companyId, 'PAYMENT_ALLOCATION', operationKey, 'APPLIED', {
      paymentId: payment.id, invoiceId: invoice.id, amount: amount(value), currency: invoice.data.currency,
      actor, subscriptionId: invoice.data.subscriptionId, periodId: invoice.data.periodId,
    }, tx);
    return { allocation, settled };
  }

  allocate(companyId: number, actor: number, paymentId: string, input: { invoiceId: string; amount: string; operationKey: string }) {
    return this.transaction(companyId, async tx => {
      const key = 'manual:' + input.operationKey;
      const value = cents(input.amount);
      const prior = await this.store.findOne({ where: { companyId, kind: 'PAYMENT_ALLOCATION', key }, transaction: tx });
      if (prior) {
        if (prior.data.paymentId !== paymentId || prior.data.invoiceId !== input.invoiceId || cents(prior.data.amount) !== value)
          throw billingError('Chave de idempotência reutilizada com outros dados.', 409);
        return prior;
      }
      const payment = await this.get(companyId, paymentId, 'PAYMENT', tx);
      if (payment.status !== 'CONFIRMED' || payment.data.invoiceId)
        throw billingError('Selecciona um recebimento confirmado ainda disponível para aplicação.', 409);
      const applied = cents(payment.data.allocated ?? '0.00');
      const reserved = await this.refundReserved(companyId, paymentId, tx);
      if (value <= 0n || applied + value + reserved > cents(payment.data.amount))
        throw billingError('Aplicação superior ao saldo do recebimento ou inválida.');
      const invoice = await this.get(companyId, input.invoiceId, 'INVOICE', tx);
      const { allocation, settled } = await this.applyPayment(companyId, actor, payment, invoice, value, key, tx);
      await this.store.update(payment, { data: { ...payment.data, allocated: amount(applied + value) } }, { transaction: tx });
      await this.event(companyId, actor, 'platform-billing.payment.allocated', {
        id: allocation.id, paymentId, invoiceId: invoice.id, subscriptionId: invoice.data.subscriptionId, periodId: invoice.data.periodId, settled,
      }, tx);
      return allocation;
    });
  }

  confirm(companyId: number, actor: number, id: string, evidence: string) {
    return this.transaction(companyId, async (tx) => {
      const payment = await this.get(companyId, id, 'PAYMENT', tx);
      if (payment.status === 'CONFIRMED') return payment;
      if (payment.status !== 'PENDING' || !evidence.trim()) throw billingError('Recebimento indisponível para confirmação.');
      if (payment.data.requestedBy === actor)
        throw billingError('A confirmação exige outro utilizador.', 403);
      const invoice = payment.data.invoiceId ? await this.get(companyId, payment.data.invoiceId, 'INVOICE', tx) : null;
      const buyer = invoice?.data.buyer ?? (await this.store.findOne({
        where: { companyId, kind: 'ACCOUNT', key: 'current' }, transaction: tx,
      }))?.data;
      if (!buyer) throw billingError('Configure os dados fiscais da conta.');
      const value = cents(payment.data.amount);
      if (value <= 0n) throw billingError('O recebimento deve ser positivo.');
      const applied = invoice ? await this.applyPayment(companyId, actor, payment, invoice, value, 'confirm:' + id, tx) : null;
      await this.store.update(
        payment,
        { status: 'CONFIRMED', data: {
          ...payment.data, confirmedBy: actor, confirmedAt: new Date().toISOString(), evidence,
          allocated: amount(applied ? value : 0n),
        } },
        { transaction: tx },
      );
      const receipt = {
        ...(await this.numberDocument(companyId, 'RC', tx)),
        buyer,
        paymentId: id,
        invoiceId: invoice?.id,
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
          invoiceId: invoice?.id,
          subscriptionId: invoice?.data.subscriptionId,
          periodId: invoice?.data.periodId,
          settled: applied?.settled ?? false,
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
