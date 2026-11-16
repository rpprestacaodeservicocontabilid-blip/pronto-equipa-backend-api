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
});
