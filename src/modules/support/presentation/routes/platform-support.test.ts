jest.mock('../../../../infra/database', () => {
  const { Sequelize } = jest.requireActual<typeof import('sequelize')>('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});

import express, { ErrorRequestHandler } from 'express';
import request from 'supertest';
import { sequelize } from '../../../../infra/database';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import { SupportApplicationService } from '../../application/use-cases/support-application.service';
import { SupportRecordRow } from '../../infrastructure/persistence/models/support-record.model';
import { SequelizeSupportStore } from '../../infrastructure/persistence/repositories/sequelize-support-store';
import { createPlatformSupportRoutes } from './platform-support.routes';

describe('Platform support administration', () => {
  const audit = { record: jest.fn(async () => {}) };
  const notifications = { notifyTicketCreated: jest.fn(async () => {}), notifyTicketUpdated: jest.fn(async () => {}) };
  const service = new SupportApplicationService(new SequelizeSupportStore(), audit, {
    getSupportEntitlements: async () => ({ supportEnabled: true, supportTier: 'DEFAULT', allowedChannels: ['PORTAL'], slaPolicyCode: 'DEFAULT' }),
  }, notifications, { assertAvailable: async () => {} });
  const grants = new Set<string>(['access', 'tickets:read-team', 'messages:create']);
  const app = express();
  app.use(express.json(), (req, _res, next) => {
    req.user = { userId: Number(req.header('x-test-admin')) || 40, accountId: 1, sessionId: 1, roles: ['SUPER_ADMIN'], permissions: [] };
    next();
  });
  app.use('/platform/support', createPlatformSupportRoutes(service, {
    audit, authorize: async (actor, permission) => actor === 40 && grants.has(permission.replace('platform:support:', '')),
  }));
  const errors: ErrorRequestHandler = (error: { statusCode?: number; issues?: unknown }, _req, res, _next) => {
    res.status(error.statusCode || (error.issues ? 400 : 500)).json({ message: String(error) });
  };
  app.use(errors);

  beforeAll(async () => {
    await CompanyModel.sync();
    await SupportRecordRow.sync();
    await CompanyModel.bulkCreate([
      { id: 7, name: 'Empresa A', slug: 'company-a', status: 'ACTIVE', timezone: 'Africa/Luanda', locale: 'pt-AO' },
      { id: 8, name: 'Empresa B', slug: 'company-b', status: 'ACTIVE', timezone: 'Africa/Luanda', locale: 'pt-AO' },
    ]);
  });
  afterAll(() => sequelize.close());
  const url = (path: string) => '/platform/support/' + path;

  it('requires platform permissions and keeps company tickets and notes isolated', async () => {
    await request(app).get(url('companies')).set('x-test-admin', '41').expect(403);
    const input = { type: 'TECHNICAL_SUPPORT' as const, categoryCode: 'ACCESS', subject: 'Private request',
      description: 'A reproducible test ticket.', idempotencyKey: 'support-private-test' };
    const privateTicket = await service.createTicket(7, 10, input);
    const sharedTicket = await service.createTicket(7, 10, { ...input, subject: 'Shared request', audience: 'PLATFORM', idempotencyKey: 'support-shared-test' });
    await service.addMessage(7, 18, sharedTicket.id, {
      body: 'Company internal note', visibility: 'INTERNAL', idempotencyKey: 'support-company-note',
    }, true);
    const path = 'companies/7/tickets/' + sharedTicket.id;
    const list = await request(app).get(url('companies/7/tickets?priority=NORMAL&type=TECHNICAL_SUPPORT')).expect(200);
    expect(list.body).toMatchObject({ total: 1, data: [{ id: sharedTicket.id }] });
    await request(app).get(url('companies/7/tickets/' + privateTicket.id)).expect(404);
    await request(app).get(url('companies/8/tickets/' + sharedTicket.id)).expect(404);
    await request(app).get(url(path + '/messages')).expect(403);
    const detail = await request(app).get(url(path)).expect(200);
    expect(detail.body.data.messages).toHaveLength(0);

    const reply = { body: 'Platform reply', idempotencyKey: 'support-platform-reply' };
    await request(app).post(url(path + '/messages')).send({ ...reply, visibility: 'INTERNAL' }).expect(400);
    await request(app).post(url(path + '/messages')).send(reply).expect(201);
    expect((await service.getTicket(7, 10, sharedTicket.id)).messages).toHaveLength(1);
    grants.add('internal-notes:read');
    grants.add('internal-notes:create');
    await request(app).post(url(path + '/internal-notes')).send({ body: 'Platform internal note', idempotencyKey: 'support-platform-note' }).expect(201);
    const notes = await request(app).get(url(path + '/messages')).expect(200);
    expect(notes.body.data.map((row: { body: string }) => row.body)).toEqual(['Platform reply', 'Platform internal note']);
    expect((await service.getTicket(7, 18, sharedTicket.id, true)).messages.map(row => row.body))
      .toEqual(['Company internal note', 'Platform reply']);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ companyId: 7, actorUserId: 40, action: 'support.platform.access' }));
  });

  it('serves the approved global article and keeps new drafts private', async () => {
    for (const permission of ['knowledge:read', 'knowledge:create', 'knowledge:update', 'knowledge:publish']) grants.add(permission);
    const created = await request(app).post(url('knowledge/articles')).send({
      slug: 'help-with-access', title: 'Access help', visibility: 'PUBLIC', content: 'Original public instructions.',
    }).expect(200);
    const article = url('knowledge/articles/' + created.body.data.id);
    await request(app).post(article + '/publish').expect(200);
    await request(app).patch(article).send({ content: 'New instructions awaiting approval.' }).expect(200);
    const records = await service.searchArticles(7, 'access');
    expect(records[0]).toMatchObject({ content: 'Original public instructions.', version: 1 });
    expect(records[0]).not.toHaveProperty('versions');
    await request(app).post(article + '/publish').expect(200);
    expect((await service.searchArticles(8, 'access'))[0]).toMatchObject({ content: 'New instructions awaiting approval.', version: 2 });
  });
});
