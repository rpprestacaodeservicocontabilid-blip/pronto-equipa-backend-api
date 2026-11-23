import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { sequelize } from '../../../infra/database';
import { errorMiddleware } from '../../../shared/middlewares/error.middleware';
import { createRequirePlatformRole } from '../../authorization/presentation/middlewares/require-platform-role.middleware';
import { CompanyModel } from '../../tenancy/infrastructure/persistence/models/company.model';
import { AI_ASSISTANT_MODELS, AiConversationModel, AiSafetyIncidentModel } from '../infrastructure/persistence/models/ai-models';
import { createPlatformAiRoutes } from '../presentation/routes/platform-ai.routes';

jest.mock('../../../infra/database', () => {
  const { Sequelize } = require('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});

describe('AI assistant platform administration', () => {
  const audit = { record: jest.fn() };
  const checker = { hasAnyRole: jest.fn(async (userId: number) => userId === 7) };
  const app = express();
  app.use(express.json(), (req, _res, next) => {
    const userId = Number(req.header('x-test-user'));
    if (userId) Object.assign(req, { user: { userId } });
    next();
  }, createRequirePlatformRole(checker)('SUPER_ADMIN'), createPlatformAiRoutes(audit));
  app.use(errorMiddleware);

  const admin = (method: 'get' | 'post' | 'patch', path: string) => request(app)[method](path).set('x-test-user', '7');

  beforeAll(async () => {
    await CompanyModel.sync();
    for (const model of AI_ASSISTANT_MODELS) await model.sync();
    await CompanyModel.bulkCreate([
      { id: 1, name: 'Empresa A', slug: 'empresa-a', status: 'ACTIVE', timezone: 'Africa/Luanda', locale: 'pt-AO' },
      { id: 2, name: 'Empresa B', slug: 'empresa-b', status: 'ACTIVE', timezone: 'Africa/Luanda', locale: 'pt-AO' },
    ]);
  });
  afterAll(() => sequelize.close());

  it('requires a current platform role, an explicit company and excludes conversation titles', async () => {
    await request(app).get('/dashboard').expect(401);
    await request(app).get('/dashboard').set('x-test-user', '8').expect(403);
    const companyA = randomUUID();
    await AiConversationModel.bulkCreate([
      { id: companyA, companyId: 1, userId: 10, title: 'Private conversation A', status: 'ACTIVE', createdAt: new Date() },
      { id: randomUUID(), companyId: 2, userId: 11, title: 'Private conversation B', status: 'ACTIVE', createdAt: new Date() },
    ]);
    await admin('get', '/conversations').expect(400);
    await admin('get', '/conversations?companyId=100').expect(404);
    const result = await admin('get', '/conversations?companyId=1').expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.data).toMatchObject({ items: [{ id: companyA }], total: 1 });
    expect(result.body.data.items[0]).not.toHaveProperty('title');
    expect(result.body.data.items[0]).not.toHaveProperty('userId');
    const dashboard = await admin('get', '/dashboard?companyId=1').expect(200);
    expect(dashboard.body.data).toMatchObject({ activeConversations: 1, tokens: 0 });
  });

  it('publishes the reviewed version atomically and keeps older content immutable', async () => {
    const first = await admin('post', '/prompts').send({ templateCode: 'TEST_PROMPT', content: 'First reviewed template.' }).expect(200);
    const second = await admin('post', '/prompts').send({ templateCode: 'TEST_PROMPT', content: 'Second reviewed template.' }).expect(200);
    await admin('post', '/prompts/' + first.body.data.id + '/publish').expect(409);
    await admin('post', '/prompts/' + second.body.data.id + '/publish').expect(200);
    const third = await admin('post', '/prompts').send({ templateCode: 'TEST_PROMPT', content: 'Third reviewed template.' }).expect(200);
    await admin('post', '/prompts/' + third.body.data.id + '/publish').expect(200);
    const result = await admin('get', '/prompts/' + second.body.data.id).expect(200);
    expect(result.body.data).toMatchObject({ status: 'ARCHIVED', content: 'Second reviewed template.' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 7, action: 'platform.ai.prompt.published' }));
  });

  it('keeps a disabled tool disabled when the platform catalogue is synchronized again', async () => {
    await admin('post', '/tools/sync').expect(200);
    let result = await admin('get', '/tools').expect(200);
    const tool = result.body.data.items[0];
    expect(tool.status).toBe('ACTIVE');
    await admin('post', '/tools/' + tool.id + '/disable').send({ reason: 'Under review' }).expect(200);
    await admin('post', '/tools/sync').expect(200);
    result = await admin('get', '/tools').expect(200);
    expect(result.body.data.items.find((item: { id: string }) => item.id === tool.id).status).toBe('DISABLED');
  });

  it('creates versioned evaluation suites and enforces company scope and incident state', async () => {
    const input = { code: 'SAFETY_REVIEW', cases: [{ name: 'Redaction', expectedBehaviour: 'Redacts sensitive details.' }] };
    await admin('post', '/evaluations').send(input).expect(200);
    const suite = await admin('post', '/evaluations').send(input).expect(200);
    expect(suite.body.data).toMatchObject({ code: 'SAFETY_REVIEW', version: 2 });
    const id = randomUUID();
    await AiSafetyIncidentModel.create({
      id, companyId: 1, category: 'POLICY_VIOLATION', severity: 'HIGH', summary: 'Sensitive detail here',
      detectedBy: 'test', createdAt: new Date(),
    });
    const status = { expected: 'OPEN', status: 'ACKNOWLEDGED', reason: 'Assigned for review' };
    await admin('patch', '/safety-incidents/' + id + '?companyId=2').send(status).expect(404);
    await admin('patch', '/safety-incidents/' + id + '?companyId=1').send(status).expect(200);
    await admin('patch', '/safety-incidents/' + id + '?companyId=1').send(status).expect(409);
    expect((await AiSafetyIncidentModel.findByPk(id))?.status).toBe('ACKNOWLEDGED');
  });
});
