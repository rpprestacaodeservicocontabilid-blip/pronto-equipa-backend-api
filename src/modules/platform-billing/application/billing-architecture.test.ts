jest.mock('../../../infra/database', () => {
  const { Sequelize } = require('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});
import { sequelize } from '../../../infra/database';
import { BillingCommercialService } from './use-cases/billing-commercial.service';
import { SequelizeBillingStore } from '../infrastructure/persistence/repositories/sequelize-billing-store';
import { BillingRecord } from '../infrastructure/persistence/models/billing-record.model';
describe('Billing through the persistence and rendering ports', () => {
  let service: BillingCommercialService;
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });
  afterAll(async () => {
    await sequelize.close();
  });
  beforeEach(async () => {
    await BillingRecord.destroy({ where: {} });
    service = new BillingCommercialService(
      new SequelizeBillingStore(),
      { render: () => Buffer.from('pdf') },
      {},
    );
    await service.account(1, 1, {
      name: 'Cliente',
      taxId: '123',
      email: 'test@example.invalid',
      address: 'Luanda',
    });
    for (const type of ['FT', 'RC', 'NC'])
      await service.configureSeries(1, 1, {
        documentType: type,
        prefix: type,
        issuer: { name: 'Emissor', taxId: '456' },
        validationReference: 'test',
      });
    await service.fiscalRule(1, 1, {
      version: 'test',
      basisPoints: 0,
      validFrom: '2020-01-01T00:00:00.000Z',
      validUntil: '2099-01-01T00:00:00.000Z',
      legalReference: 'Test fixture',
    });
  });
  async function issue() {
    const row = await service.draft(1, 1, {
      operationKey: 'invoice-123',
      currency: 'AOA',
      dueAt: '2030-01-01T00:00:00.000Z',
      lines: [
        {
          description: 'Serviço',
          quantity: 1,
          unitPrice: '100.00',
          discount: '0.00',
          taxBasisPoints: 0,
          taxRuleVersion: 'test',
        },
      ],
    });
    return service.issue(1, 1, row.id);
  }
  it('issues the same invoice once and keeps numbering stable on replay', async () => {
    const first = await issue();
    const second = await service.issue(1, 1, first.id);
    expect(second.data.number).toBe(first.data.number);
    expect(first.data.number).toBe('FT/1/1');
    expect(await service.list(1, 'INVOICE')).toHaveLength(1);
    expect(await service.list(2, 'INVOICE')).toHaveLength(0);
  });
  it('requires another actor and creates a single numbered receipt', async () => {
    const invoice = await issue();
    const payment = await service.payment(1, 1, {
      provider: 'manual',
      reference: 'p1',
      invoiceId: invoice.id,
      currency: 'AOA',
      amount: '100.00',
    });
    await expect(service.confirm(1, 1, payment.id, 'evidence')).rejects.toThrow();
    await service.confirm(1, 2, payment.id, 'evidence');
    await service.confirm(1, 2, payment.id, 'evidence');
    const receipts = await service.list(1, 'RECEIPT');
    expect(receipts).toHaveLength(1);
    expect(receipts[0].data.number).toBe('RC/1/1');
    expect((await service.balance(1)).AOA.outstanding).toBe('0.00');
  });
  it('preserves the invoice snapshot when issuing a numbered credit note', async () => {
    const invoice = await issue(),
      hash = invoice.data.documentHash;
    const note = await service.credit(1, 2, {
      invoiceId: invoice.id,
      amount: '20.00',
      reason: 'Ajuste',
      operationKey: 'credit-123',
    });
    expect(note.data.number).toBe('NC/1/1');
    expect((await service.list(1, 'INVOICE'))[0].data.documentHash).toBe(hash);
    expect((await service.balance(1)).AOA.outstanding).toBe('80.00');
  });

  it('allocates an independently confirmed receipt exactly once and honours refund reserves', async () => {
    const invoice = await issue();
    const payment = await service.payment(1, 3, { provider: 'bank', reference: 'unallocated', amount: '120.00', currency: 'AOA' });
    await expect(service.confirm(1, 3, payment.id, 'Bank evidence #1')).rejects.toMatchObject({ statusCode: 403 });
    await service.confirm(1, 4, payment.id, 'Bank evidence #1');
    expect((await service.balance(1)).AOA.outstanding).toBe('100.00');
    expect((await service.list(1, 'RECEIPT'))[0].data.invoiceId).toBeUndefined();
    await service.refund(1, 3, { paymentId: payment.id, amount: '30.00', reason: 'Residual funds', operationKey: 'refund-reserve' });
    const input = { invoiceId: invoice.id, operationKey: 'first-application', amount: '60.00' };
    await expect(service.allocate(2, 4, payment.id, input)).rejects.toMatchObject({ statusCode: 404 });
    const applied = await service.allocate(1, 4, payment.id, input);
    expect((await service.allocate(1, 4, payment.id, input)).id).toBe(applied.id);
    await expect(service.allocate(1, 4, payment.id, { ...input, amount: '60.01' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.allocate(1, 4, payment.id, { ...input, operationKey: 'second-application', amount: '30.01' })).rejects.toThrow();
    expect((await service.balance(1)).AOA.outstanding).toBe('40.00');
    expect(await service.list(1, 'PAYMENT_ALLOCATION')).toHaveLength(1);
    expect(await service.list(1, 'RECEIPT')).toHaveLength(1);
  });

  it('preserves the reversed reconciliation, audits the reason and permits an authorised rematch', async () => {
    const invoice = await issue();
    const payment = await service.payment(1, 1, {
      invoiceId: invoice.id, currency: 'AOA', amount: '25.00', provider: 'bank', reference: 'movement-1',
    });
    await service.confirm(1, 2, payment.id, 'Statement line');
    await service.importStatement(1, 2, { operationKey: 'bank-batch-1', entries: ['one', 'two'].map(reference =>
      ({ reference, amount: '25.00', currency: 'AOA', occurredAt: '2026-11-23T00:00:00.000Z' })) });
    const [first, second] = await service.list(1, 'BANK_ENTRY');
    await service.reviewBankEntry(1, 2, first.id, 'Ambiguous reference');
    await service.reconcile(1, 2, first.id, payment.id);
    await expect(service.reconcile(1, 2, second.id, payment.id)).rejects.toMatchObject({ statusCode: 409 });
    const [match] = await service.list(1, 'RECONCILIATION');
    await expect(service.reverseReconciliation(2, 3, match.id, 'Wrong company')).rejects.toMatchObject({ statusCode: 404 });
    await service.reverseReconciliation(1, 3, match.id, 'Wrong statement entry selected');
    await service.reverseReconciliation(1, 3, match.id, 'Retry');
    await service.reconcile(1, 3, second.id, payment.id);
    const matches = await service.list(1, 'RECONCILIATION');
    expect(matches).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: match.id, status: 'REVERSED', data: expect.objectContaining({ reversalReason: 'Wrong statement entry selected' }) }),
      expect.objectContaining({ status: 'MATCHED', data: expect.objectContaining({ entryId: second.id }) }),
    ]));
    expect((await service.balance(1)).AOA.outstanding).toBe('75.00');
    expect((await service.list(1, 'AUDIT')).filter(row => row.data.event === 'platform-billing.reconciliation.reversed')).toHaveLength(1);
  });

  it('validates a draft without consuming document numbering and rechecks tax at issue', async () => {
    const draft = await service.draft(1, 1, {
      operationKey: 'preflight', currency: 'AOA', dueAt: '2030-01-01T00:00:00.000Z',
      lines: [{ description: 'Serviço', quantity: 1, unitPrice: '100.00', discount: '0.00', taxBasisPoints: 0, taxRuleVersion: 'test' }],
    });
    expect(await service.validateInvoice(1, draft.id)).toEqual({ ready: true });
    const [saved] = await service.list(1, 'INVOICE');
    expect(saved.status).toBe('DRAFT');
    const rule = await BillingRecord.findOne({ where: { companyId: 1, kind: 'TAX_RULE' } });
    await rule!.update({ status: 'INACTIVE' });
    await expect(service.issue(1, 1, draft.id)).rejects.toThrow('Regra fiscal');
    expect((await service.list(1, 'SERIES')).every(row => row.data.counter === 0)).toBe(true);
  });

  it('keeps a debit note atomic and preserves its numbering and original invoice on replay', async () => {
    const invoice = await issue();
    const input = { invoiceId: invoice.id, operationKey: 'debit-test', reason: 'Supplemental service', lines: [{
      description: 'Service', quantity: 1, unitPrice: '10.00', discount: '0.00', taxBasisPoints: 0, taxRuleVersion: 'test',
    }] };
    await expect(service.debit(1, 2, input)).rejects.toThrow('ND');
    expect(await service.list(1, 'INVOICE')).toHaveLength(1);
    await service.configureSeries(1, 1, { documentType: 'ND', prefix: 'ND', issuer: { name: 'Issuer' }, validationReference: 'test' });
    const debit = await service.debit(1, 2, input);
    expect(debit.data).toMatchObject({ number: 'ND/1/1', documentType: 'DEBIT_NOTE', originalInvoiceId: invoice.id });
    expect((await service.debit(1, 2, input)).id).toBe(debit.id);
    await expect(service.debit(1, 2, { ...input, reason: 'Different adjustment' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.issue(1, 3, debit.id)).rejects.toMatchObject({ statusCode: 409 });
  });
});
