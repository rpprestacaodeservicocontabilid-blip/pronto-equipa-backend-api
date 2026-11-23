jest.mock('../../../../infra/database', () => {
  const { Sequelize } = jest.requireActual<typeof import('sequelize')>('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});
import express, { ErrorRequestHandler } from 'express';
import request from 'supertest';
import { sequelize } from '../../../../infra/database';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import { NotificationsService } from '../../application/use-cases/notifications.service';
import { NotificationRow } from '../../infrastructure/persistence/models/notification.model';
import { SequelizeNotificationStore } from '../../infrastructure/persistence/repositories/sequelize-notification-store';
import { createPlatformNotificationsRoutes } from './platform-notifications.routes';

describe('Platform notifications administration', () => {
  const app = express();
  const audit = { record: jest.fn(async () => {}) };
  const grants = new Set(['access', 'deliveries:read', 'bulk:send']);
  const service = new NotificationsService(
    { resolve: async () => ({ email: 'person@example.invalid', phone: null }) },
    { send: async () => ({ status: 'ACCEPTED', providerMessageId: 'sample-provider' }) },
    new SequelizeNotificationStore(),
  );
  app.use(express.json(), (req, _res, next) => {
    req.user = { userId: Number(req.header('x-test-actor')) || 1, accountId: 1, sessionId: 1, roles: ['SUPER_ADMIN'], permissions: [] };
    next();
  });
  app.use('/platform/notifications', createPlatformNotificationsRoutes(service, {
    audit, authorize: async (actor, permission) => actor === 1 && grants.has(permission.replace('platform:notifications:', '')),
  }));
  const errors: ErrorRequestHandler = (error: { statusCode?: number; issues?: unknown }, _req, res, _next) => {
    res.status(error.statusCode || (error.issues ? 400 : 500)).json({ message: String(error) });
  };
  app.use(errors);

  beforeAll(async () => {
    await CompanyModel.sync();
    await NotificationRow.sync();
    await CompanyModel.bulkCreate([
      { id: 7, name: 'Empresa A', slug: 'ntf-company-a', status: 'ACTIVE', timezone: 'Africa/Luanda', locale: 'pt-AO' },
      { id: 8, name: 'Empresa B', slug: 'ntf-company-b', status: 'ACTIVE', timezone: 'Africa/Luanda', locale: 'pt-AO' },
    ]);
  });
  afterAll(() => sequelize.close());

  it('authorizes each operation, isolates company deliveries and redacts delivery contents', async () => {
    const root = '/platform/notifications';
    const company = root + '/companies/7';
    const template = await service.template(7, 1, {
      code: 'NOTICES', category: 'ANNOUNCEMENT', subject: 'Company notice', body: 'Message for the recipient', mandatory: false,
    });
    await service.publish(7, 1, template.id);
    await request(app).get(company + '/deliveries').set('x-test-actor', '2').expect(403);
    await request(app).get(company + '/templates').expect(403);
    await request(app).post(company + '/campaigns').send({
      key: 'route-test-campaign', category: 'ANNOUNCEMENT', template: 'NOTICES', recipients: [91], variables: {}, channels: ['IN_APP'],
    }).expect(200);
    await service.process(7);
    const response = await request(app).get(company + '/deliveries?status=DELIVERED&channel=IN_APP').expect(200);
    const [delivery] = response.body.data.items;
    expect(response.body.data.total).toBe(1);
    expect(delivery.data.channel).toBe('IN_APP');
    expect(delivery.data).not.toHaveProperty('subject');
    expect(delivery.data).not.toHaveProperty('body');
    expect(delivery.data).not.toHaveProperty('recipient');
    expect(delivery.data).not.toHaveProperty('lastError');
    await request(app).get(root + '/companies/8/deliveries/' + delivery.id + '/attempts').expect(404);
    expect((await request(app).get(root + '/deliveries').expect(200)).body.data.total).toBe(0);
    expect((await request(app).get(company + '/deliveries/' + delivery.id + '/attempts').expect(200)).body.data).toHaveLength(1);
    await request(app).post(company + '/deliveries/' + delivery.id + '/retry').send({}).expect(403);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ companyId: 7, actorUserId: 1, action: 'notifications.platform.access' }));
  });
});