jest.mock('../../../../infra/database', () => {
  const { Sequelize } = jest.requireActual<typeof import('sequelize')>('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});

import express, { ErrorRequestHandler } from 'express';
import request from 'supertest';
import { sequelize } from '../../../../infra/database';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import { BillingRecord } from '../../infrastructure/persistence/models/billing-record.model';
import { createPlatformBillingModule } from '../../platform-billing.module';

describe('Platform billing administration permissions', () => {
  const access = new Map<number, string[]>([
    [10, ['payments:read']], [11, ['reports:read']], [12, ['reconciliation:read', 'reconciliation:execute']],
  ]);
  const billing = createPlatformBillingModule({
    requirePermission: () => (_req, _res, next) => next(),
    isPlatformAdmin: async actor => actor === 90,
    authorizePlatform: async (actor, permission) => access.get(actor)?.some(code => permission === 'platform-billing:' + code) ?? false,
  });
  const api = express();
  api.use(express.json(), (req, _res, next) => {
    const userId = Number(req.header('x-test-actor'));
    if (userId) req.user = { userId, accountId: 1, sessionId: 1, roles: [], permissions: [] };
    next();
  });
  api.use('/admin', billing.adminRoutes);
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error.statusCode || (error.issues ? 400 : 500)).json({ message: String(error) });
  };
  api.use(errors);
  beforeAll(async () => {
    await CompanyModel.sync();
    await BillingRecord.sync();
    await CompanyModel.create({ id: 7, name: 'Test company', slug: 'billing-test-company', status: 'ACTIVE', timezone: 'Africa/Luanda', locale: 'pt-AO' });
  });
  afterAll(() => sequelize.close());

  it('checks live platform permissions per section, operation and export', async () => {
    const path = '/admin/tenants/7/payments';
    const body = { provider: 'test-bank', reference: 'test-receipt', amount: '15.00', currency: 'AOA' };
    await request(api).get('/admin/records/PAYMENT').expect(401);
    await request(api).post(path).set('x-test-actor', '10').send(body).expect(403);
    const created = await request(api).post(path).set('x-test-actor', '90').send(body).expect(200);
    const list = await request(api).get('/admin/records/PAYMENT').set('x-test-actor', '10').expect(200);
    expect(list.body.data.items.map((row: { id: string }) => row.id)).toEqual([created.body.data.id]);
    await request(api).get('/admin/records/AUDIT').set('x-test-actor', '10').expect(403);
    await request(api).get('/admin/reports/export').set('x-test-actor', '11').expect(403);
    await request(api).get('/admin/reports/export?companyId=7').set('x-test-actor', '90').expect(200);
    await request(api).post('/admin/tenants/7/reconciliation/' + created.body.data.id + '/reverse')
      .set('x-test-actor', '12').send({ reason: 'Requires explicit permission' }).expect(403);
  });
});
