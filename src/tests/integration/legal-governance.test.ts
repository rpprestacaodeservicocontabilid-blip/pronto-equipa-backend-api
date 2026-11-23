import 'express-async-errors';
import express, { ErrorRequestHandler } from 'express';
import request from 'supertest';
import { DataTypes } from 'sequelize';
import { ENV } from '../../config/env';
import { sequelize } from '../../infra/database';
import { createLegalRulesModule } from '../../modules/legal-rules/legal-rules.module';
import { AuthorizationService } from '../../modules/authorization/application/services/authorization.service';
import { LegalRuleSetModel } from '../../modules/legal-rules/infrastructure/persistence/legal-rule-set.model';

describe('Legal rules platform governance', () => {
  const audit = { record: jest.fn(async () => {}) };
  const authorization = {
    authorize: async ({ context, principalId, permission }: { context: { type: string }; principalId: number; permission: string }) =>
      context.type === 'platform' && (principalId === 1 ? permission !== 'legal-rules:approve' : principalId === 2),
  } as unknown as AuthorizationService;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: Number(req.header('X-Test-Actor') ?? 0) } as typeof req.user;
    next();
  });
  app.use('/legal-rules', createLegalRulesModule({ audit, authorization }).managementRoutes);
  app.use(((error, _req, res, _next) => res.status(error.statusCode || (error.name === 'ZodError' ? 422 : 500))
    .json({ message: error.message })) as ErrorRequestHandler);

  const route = '/legal-rules';
  const input = {
    companyId: null, ruleSetId: 'Fixture', version: '1', jurisdiction: 'AO',
    effectiveFrom: '2026-01-01', effectiveTo: '2026-11-30',
    sourceReference: 'Fixture instrument', evidenceReference: 'Fixture review',
    rules: {
      roundingPolicy: { mode: 'HALF_EVEN', scale: 2 }, laborRules: { prorationBasis: 'CALENDAR_DAYS' },
      socialSecurityRules: { employeeRate: '0', employerRate: '0' },
      incomeTaxRules: { calculation: 'PROGRESSIVE', brackets: [{ from: '0', rate: '0' }] },
      deductionRules: {},
    },
  };
  const sourceInput = { type: 'LAW', reference: 'Fixture-1', title: 'Fixture source', issuer: 'Fixture institution',
    publishedOn: '2026-01-01', officialUrl: 'https://example.test/fixture', documentUrl: 'https://example.test/fixture.pdf',
  };
  let sourceId: string;

  beforeAll(async () => {
    if (ENV.NODE_ENV !== 'test' || sequelize.getDialect() !== 'sqlite' || ENV.DB.STORAGE !== ':memory:')
      throw new Error('This test requires isolated in-memory SQLite.');
    const q = sequelize.getQueryInterface();
    await q.createTable('companies', { id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false } });
    await require('../../infra/database/migrations/20261114000000-create-legal-rules').up(q, DataTypes);
    await require('../../infra/database/migrations/20261120000000-add-legal-governance').up(q, DataTypes);
  });

  afterAll(async () => { await sequelize.close(); });

  test('registers official references with platform access and audit evidence', async () => {
    const denied = await request(app).post(route + '/sources').set('X-Test-Actor', '3').send(sourceInput);
    expect(denied.status).toBe(403);
    const unsafe = await request(app).post(route + '/sources').set('X-Test-Actor', '1').send({ ...sourceInput, officialUrl: 'not-a-url' });
    expect(unsafe.status).toBe(422);
    const saved = await request(app).post(route + '/sources').set('X-Test-Actor', '1').send(sourceInput);
    expect(saved.status).toBe(201);
    sourceId = saved.body.data.id;
    const sources = await request(app).get(route + '/sources').set('X-Test-Actor', '1');
    expect(sources.body.data.items).toEqual([expect.objectContaining({ id: sourceId, reference: sourceInput.reference })]);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'legal-rules.source-registered', entityId: sourceId }));
  });

  test('freezes reviewed contents, rejects stale changes and preserves rejection evidence', async () => {
    const created = await request(app).post(route).set('X-Test-Actor', '2').send({
      ...input, governance: { sourceIds: [sourceId], minimumWage: { amount: '1000', sector: 'Fixture', regime: 'Test' } },
    });
    expect(created.status).toBe(201);
    const draft = created.body.data;
    const url = route + '/' + draft.id;
    const stale = await request(app).patch(url).set('X-Test-Actor', '2')
      .send({ sourceReference: 'Stale update', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' });
    expect(stale.status).toBe(409);
    const sent = await request(app).post(url + '/submit').set('X-Test-Actor', '2').send({ expectedUpdatedAt: draft.updatedAt });
    expect(sent.status).toBe(200);
    expect((await request(app).post(url + '/approve').set('X-Test-Actor', '2').send({})).status).toBe(409);
    expect((await request(app).patch(url).set('X-Test-Actor', '2').send({ governance: null })).status).toBe(409);
    const rejected = await request(app).post(url + '/reject').set('X-Test-Actor', '4')
      .send({ expectedUpdatedAt: sent.body.data.updatedAt, reason: 'Review the supporting reference.' });
    expect(rejected.status).toBe(403);
    const reviewer = express();
    reviewer.use(express.json());
    reviewer.use((req, _res, next) => { req.user = { userId: 4 } as typeof req.user; next(); });
    const reviewAuthorization = { authorize: async () => true } as unknown as AuthorizationService;
    reviewer.use(route, createLegalRulesModule({ audit, authorization: reviewAuthorization }).managementRoutes);
    const decision = await request(reviewer).post(url + '/reject')
      .send({ expectedUpdatedAt: sent.body.data.updatedAt, reason: 'Review the supporting reference.' });
    expect(decision.status).toBe(200);
    expect(decision.body.data).toMatchObject({ status: 'REJECTED', rejectedBy: 4, rejectionReason: 'Review the supporting reference.' });
    expect((await LegalRuleSetModel.findByPk(draft.id))?.governance?.sourceIds).toEqual([sourceId]);
  });

  test('compares draft and reference periods with fictional salaries without persisting a run', async () => {
    const versionOne = await request(app).get(route).set('X-Test-Actor', '1');
    const baseline = versionOne.body.data.items[0];
    const proposal = await request(app).post(route).set('X-Test-Actor', '1').send({
      ...input, version: '2', effectiveFrom: '2026-12-01', effectiveTo: null,
      rules: { ...input.rules, incomeTaxRules: { calculation: 'PROGRESSIVE', brackets: [{ from: '0', rate: '0.10' }] } },
    });
    expect(proposal.status).toBe(201);
    const count = await LegalRuleSetModel.count();
    const simulation = await request(app).post(route + '/impact').set('X-Test-Actor', '1').send({
      baselineId: baseline.id, proposalId: proposal.body.data.id, baselineMonth: '2026-11', proposalMonth: '2026-12',
      salaries: ['100000'],
    });
    expect(simulation.status).toBe(200);
    expect(simulation.body.data.rows[0]).toMatchObject({ difference: { incomeTax: '10000.00', netAmount: '-10000.00' } });
    expect(await LegalRuleSetModel.count()).toBe(count);
  });
});
