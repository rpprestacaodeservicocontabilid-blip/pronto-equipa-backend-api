import { generateKeyPairSync, randomUUID } from 'crypto';
import express, { ErrorRequestHandler } from 'express';
import request from 'supertest';
import { Sequelize, DataTypes, QueryTypes } from 'sequelize';
import { sequelize } from '../../infra/database';
import { withRecordTransaction } from '../../shared/infrastructure/persistence/sequelize-record-store';
import {
  AUDIT_ENGINE_MODELS,
  AuditRecordModel,
  AuditHeadModel,
  AuditCaptureModel,
} from '../../modules/audit/infrastructure/persistence/models/audit-engine.models';
import { SequelizeAuditEngineRepository } from '../../modules/audit/infrastructure/persistence/repositories/sequelize-audit-engine.repository';
import { NodeAuditCrypto } from '../../modules/audit/infrastructure/integrity/node-audit-crypto';
import { AuditEvidenceStoragePort } from '../../modules/audit/application/ports/audit-engine.ports';
import { AuditCore } from '../../modules/audit/application/use-cases/audit-core';
import { AuditQueryService } from '../../modules/audit/application/use-cases/audit-query.service';
import { AuditEvidenceService } from '../../modules/audit/application/use-cases/audit-evidence.service';
import { AuditIntegrityService } from '../../modules/audit/application/use-cases/audit-integrity.service';
import { AuditExportService } from '../../modules/audit/application/use-cases/audit-export.service';
import { AuditInvestigationService } from '../../modules/audit/application/use-cases/audit-investigation.service';
import { AuditRetentionService } from '../../modules/audit/application/use-cases/audit-retention.service';
import { AuditMonitorService } from '../../modules/audit/application/use-cases/audit-monitor.service';
import { AuditServices } from '../../modules/audit/application/use-cases/audit-services';
import {
  AuditAccess,
  AuditEventInput,
  auditScope,
} from '../../modules/audit/domain/audit-contracts';
import { createAuditEngineRoutes } from '../../modules/audit/presentation/routes/audit-engine.routes';
import { DatabaseAuditEventSource } from '../../modules/audit/infrastructure/adapters/database-audit-event-source';
import {
  redactAudit,
  normalizeAudit,
} from '../../modules/audit/domain/services/audit-data.service';

jest.setTimeout(60000);
const keys = generateKeyPairSync('ed25519');
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const memoryStorage = (): AuditEvidenceStoragePort => {
  const files = new Map<string, Buffer>(),
    anchors = new Map<string, Buffer>();
  return {
    async put(scope, id, bytes) {
      const key = `${scope}/${id}`;
      if (files.has(key)) throw new Error('immutable');
      files.set(key, Buffer.from(bytes));
      return key;
    },
    async read(key) {
      const bytes = files.get(key);
      if (!bytes) throw new Error('missing');
      return Buffer.from(bytes);
    },
    async anchor(scope, id, bytes) {
      anchors.set(`${scope}/${id}`, Buffer.from(bytes));
      return `${scope}/${id}`;
    },
    async anchors(scope) {
      return [...anchors.entries()]
        .filter(([key]) => key.startsWith(`${scope}/`))
        .map(([key, bytes]) => ({ key, bytes: Buffer.from(bytes) }));
    },
  };
};
const access = (company = 1, actor = 10, sensitive = true): AuditAccess => ({
  ...auditScope(company),
  actorId: actor,
  purpose: 'Compliance investigation',
  sensitive,
});
const event = (company = 1, overrides: Partial<AuditEventInput> = {}): AuditEventInput => ({
  eventId: randomUUID(),
  eventType: 'test.changed',
  category: 'DATA_CHANGE',
  severity: 'MEDIUM',
  scope: 'TENANT',
  tenantId: String(company),
  actor: { actorType: 'USER', actorId: '10' },
  action: 'CHANGE',
  resource: { resourceType: 'employee', resourceId: 'emp-1' },
  sourceId: 'test',
  outcome: 'SUCCESS',
  occurredAt: new Date().toISOString(),
  ...overrides,
});
let services: AuditServices;
beforeEach(async () => {
  for (const model of [...AUDIT_ENGINE_MODELS].reverse()) await model.drop();
  for (const model of AUDIT_ENGINE_MODELS) await model.sync();
  const core = new AuditCore(
    new SequelizeAuditEngineRepository(),
    new NodeAuditCrypto(privateKey),
    { now: () => new Date(), id: randomUUID },
  );
  const storage = memoryStorage(),
    evidence = new AuditEvidenceService(core, storage),
    integrity = new AuditIntegrityService(core, storage);
  services = {
    core,
    query: new AuditQueryService(core),
    evidence,
    integrity,
    exports: new AuditExportService(core, evidence),
    investigations: new AuditInvestigationService(core),
    retention: new AuditRetentionService(core, evidence, integrity),
    monitor: new AuditMonitorService(core, new DatabaseAuditEventSource()),
  };
});

test('normalizes, recursively redacts credentials, and rejects invalid scopes and cyclic payloads', () => {
  const input = event(1, {
    metadata: {
      password: 'secret',
      nested: { access_token: 'secret', iban: 'AO123' },
      public: 'ok',
    },
    changes: [{ field: 'credentials.password', after: 'secret' }],
  });
  const normalized = normalizeAudit(input, new Date());
  expect(normalized.metadata).toMatchObject({
    password: '[REDACTED]',
    nested: { access_token: '[REDACTED]', iban: '[REDACTED]' },
    public: 'ok',
  });
  expect(normalized.changes?.[0].after).toBe('[REDACTED]');
  expect(() => normalizeAudit(event(1, { scope: 'PLATFORM' }), new Date())).toThrow('scope');
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  expect(() => redactAudit(cycle)).toThrow('Cyclic');
});
test('persists immutable sequence, deduplicates concurrent retries, rejects conflicting identity', async () => {
  const input = event();
  const results = await Promise.all(Array.from({ length: 12 }, () => services.core.append(input)));
  expect(new Set(results.map((r) => r.auditRecordId)).size).toBe(1);
  expect(results.filter((r) => r.duplicate)).toHaveLength(11);
  await expect(services.core.append({ ...input, action: 'CONFLICT' })).rejects.toMatchObject({
    statusCode: 409,
  });
  await Promise.all(Array.from({ length: 15 }, () => services.core.append(event())));
  expect((await services.integrity.verify(auditScope(1))).valid).toBe(true);
  expect(await AuditRecordModel.count()).toBe(16);
  expect(await services.core.list(auditScope(1), 'OUTBOX')).toHaveLength(16);
  await expect(AuditRecordModel.update({ action: 'bad' } as never, { where: {} })).rejects.toThrow(
    'append-only',
  );
  await expect(AuditRecordModel.destroy({ where: {} })).rejects.toThrow('append-only');
});
test('critical audit and business write share rollback, including audit persistence failure', async () => {
  await sequelize.query(
    'CREATE TABLE IF NOT EXISTS audit_test_business (id INTEGER PRIMARY KEY, value TEXT)',
  );
  await expect(
    sequelize.transaction((tx) =>
      withRecordTransaction(tx, 1, async (context) => {
        await sequelize.query("INSERT INTO audit_test_business VALUES (1,'pending')", {
          transaction: tx,
        });
        await services.core.append(event(), context);
        throw new Error('rollback');
      }),
    ),
  ).rejects.toThrow('rollback');
  expect(await AuditRecordModel.count()).toBe(0);
  expect(
    await sequelize.query('SELECT * FROM audit_test_business', { type: QueryTypes.SELECT }),
  ).toHaveLength(0);
  const failure = jest
    .spyOn(services.core.repository, 'insert')
    .mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(
    sequelize.transaction((tx) =>
      withRecordTransaction(tx, 1, async (context) => {
        await sequelize.query("INSERT INTO audit_test_business VALUES (1,'pending')", {
          transaction: tx,
        });
        await services.core.append(event(), context);
      }),
    ),
  ).rejects.toThrow('storage unavailable');
  failure.mockRestore();
  expect(
    await sequelize.query('SELECT * FROM audit_test_business', { type: QueryTypes.SELECT }),
  ).toHaveLength(0);
  await sequelize.query('DROP TABLE audit_test_business');
});
test('tenant boundaries, sensitive access, and safe personal history are enforced', async () => {
  const a = await services.core.append(event()),
    b = await services.core.append(event(2)),
    pay = await services.core.append(event(1, { category: 'PAYROLL' }));
  await expect(services.query.get(access(2), a.auditRecordId)).rejects.toMatchObject({
    statusCode: 404,
  });
  await expect(services.query.get(access(1, 10, false), pay.auditRecordId)).rejects.toMatchObject({
    statusCode: 403,
  });
  const page = await services.query.search(access(1, 10, false), {});
  expect(page.data.map((r) => r.id)).toContain(a.auditRecordId);
  expect(page.data.map((r) => r.id)).not.toContain(b.auditRecordId);
  expect(page.data.map((r) => r.id)).not.toContain(pay.auditRecordId);
  await expect(
    services.query.get({ ...access(), ownOnly: true }, a.auditRecordId),
  ).rejects.toMatchObject({ statusCode: 404 });
  const own = await services.core.append(
    event(1, { resource: { resourceType: 'USER', resourceId: '10' } }),
  );
  expect(
    (await services.query.search({ ...access(), ownOnly: true }, {})).data.map((r) => r.id),
  ).toEqual([own.auditRecordId]);
});
test('signed evidence is verifiable and export approval requires a different person', async () => {
  const record = await services.core.append(event());
  const investigation = await services.investigations.open(
    access(),
    'Investigation',
    'Verify payment controls',
  );
  await services.investigations.addEvidence(access(), investigation.id, [record.auditRecordId]);
  const pack = await services.evidence.create(access(), [record.auditRecordId], investigation.id);
  expect((await services.evidence.verify(access(), pack.id)).valid).toBe(true);
  const bytes = await services.evidence.download(access(), pack.id);
  expect(JSON.parse(bytes.toString()).recordIds).toEqual([record.auditRecordId]);
  const exp = await services.exports.request(access(), { eventType: 'test.changed' });
  await expect(
    services.exports.decide(access(), exp.id, true, 'Approved independently'),
  ).rejects.toMatchObject({ statusCode: 409 });
  await services.exports.decide(access(1, 11), exp.id, true, 'Approved independently');
  const completed = await services.exports.execute(access(), exp.id);
  expect(completed.status).toBe('READY');
  await expect(services.exports.download(access(1, 11), exp.id)).rejects.toMatchObject({
    statusCode: 403,
  });
  expect(await services.exports.download(access(), exp.id)).toBeInstanceOf(Buffer);
  await services.investigations.close(access(), investigation.id, 'Review completed');
  await expect(
    services.investigations.addEvidence(access(), investigation.id, [record.auditRecordId]),
  ).rejects.toMatchObject({ statusCode: 409 });
});
test('detects changed payloads, removed sequence records, and rolled-back heads against independent anchors', async () => {
  const first = await services.core.append(event()),
    second = await services.core.append(event());
  await services.integrity.checkpoint(access());
  expect((await services.integrity.verify(auditScope(1))).valid).toBe(true);
  await sequelize.query('UPDATE audit_records SET "payloadHash"=:bad WHERE id=:id', {
    replacements: { bad: '1'.repeat(64), id: first.auditRecordId },
  });
  expect(
    (await services.integrity.verify(auditScope(1))).failures.some(
      (f) => f.code === 'RECORD_HASH_MISMATCH',
    ),
  ).toBe(true);
  await sequelize.query('DELETE FROM audit_records WHERE id=:id', {
    replacements: { id: second.auditRecordId },
  });
  expect(
    (await services.integrity.verify(auditScope(1))).failures.some(
      (f) => f.code === 'SEQUENCE_GAP',
    ),
  ).toBe(true);
  await AuditHeadModel.update(
    { sequence: 0, recordHash: '0'.repeat(64) },
    { where: { scopeKey: 'tenant:1' } },
  );
  expect(
    (await services.integrity.verify(auditScope(1))).failures.some(
      (f) => f.code === 'HEAD_ROLLBACK',
    ),
  ).toBe(true);
});
test('archives according to explicit versioned retention, respects legal holds, and never deletes originals', async () => {
  const occurredAt = new Date(Date.now() - 10 * 86400000).toISOString();
  const held = await services.core.append(event(1, { occurredAt })),
    archivable = await services.core.append(event(1, { occurredAt }));
  const hold = await services.retention.hold(access(), {
    reason: 'Pending judicial review',
    recordIds: [held.auditRecordId],
  });
  const policy = await services.retention.policy(access(), {
    category: 'DATA_CHANGE',
    days: 2,
    reason: 'Approved policy',
    legalReference: 'Approved organization retention policy',
  });
  const run = await services.retention.execute(access(), policy.id);
  expect(run.data).toMatchObject({ archived: 1, held: 1, deleted: 0 });
  expect((await services.retention.execute(access(), policy.id)).id).toBe(run.id);
  expect(await AuditRecordModel.findByPk(archivable.auditRecordId)).not.toBeNull();
  await services.retention.release(access(), hold.id, 'Review concluded');
});
test('records recoverable ingestion failure and reconciles duplicates without losing an old committed capture', async () => {
  const input = event();
  const failure = jest
    .spyOn(services.core.repository, 'insert')
    .mockRejectedValueOnce(new Error('temporary outage'));
  expect(await services.monitor.ingest(auditScope(1), input)).toBeNull();
  failure.mockRestore();
  const [dead] = await services.core.list(auditScope(1), 'INGESTION_FAILURE');
  expect(dead.status).toBe('RETRY');
  expect((await services.monitor.retry(auditScope(1), dead.id, true)).status).toBe('RECOVERED');
  const capture = (ago: number) => ({
    id: randomUUID(),
    companyId: 1,
    sourceId: 'database',
    eventType: 'database.payroll_runs.update',
    resourceType: 'payroll_runs',
    resourceId: randomUUID(),
    actorId: '10',
    correlationId: randomUUID(),
    occurredAt: new Date(Date.now() - ago),
    payload: { operation: 'UPDATE' },
    processedAt: null,
  });
  await AuditCaptureModel.create(capture(10000));
  expect((await services.monitor.drain(auditScope(1))).ingested).toBe(1);
  await AuditCaptureModel.create(capture(60000));
  expect((await services.monitor.drain(auditScope(1))).ingested).toBe(1);
  expect((await services.monitor.drain(auditScope(1))).scanned).toBe(0);
  expect((await services.monitor.drain(auditScope(1), true)).duplicates).toBe(2);
});
test('HTTP guards require explicit permission and purpose, reject cross-tenant ids and mutation APIs', async () => {
  const receipt = await services.core.append(event(2));
  const granted = new Set<string>();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 10, accountId: 1, sessionId: 1, roles: [], permissions: [] };
    req.tenant = { companyId: 1 } as Express.Request['tenant'];
    next();
  });
  app.use(
    '/audit',
    createAuditEngineRoutes(services, async (_actor, _company, permission) =>
      granted.has(permission),
    ),
  );
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const data = error as { statusCode?: number };
    res.status(data.statusCode || 500).json({ error: true });
  };
  app.use(errors);
  expect(
    (await request(app).get('/audit/records').query({ purpose: 'Review controls' })).status,
  ).toBe(403);
  granted.add('audit:records:read-tenant');
  expect((await request(app).get('/audit/records')).status).toBe(422);
  expect(
    (
      await request(app)
        .get(`/audit/records/${receipt.auditRecordId}`)
        .query({ purpose: 'Review controls', companyId: 2 })
    ).status,
  ).toBe(404);
  expect(
    (await request(app).get('/audit/records').query({ purpose: 'Review controls', limit: 1001 }))
      .status,
  ).toBe(422);
  expect((await request(app).delete(`/audit/records/${receipt.auditRecordId}`)).status).toBe(404);
});

test('migration installs transactional capture and SQL append-only guards, and rolls business write back if capture fails', async () => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }),
    q = db.getQueryInterface();
  const migration =
    require('../../infra/database/migrations/20261116000010-create-audit-engine.js') as {
      up(q: unknown, s: unknown): Promise<void>;
    };
  try {
    await q.createTable('companies', {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      name: DataTypes.STRING,
    });
    await q.createTable('roles', {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      companyId: DataTypes.INTEGER,
    });
    await q.createTable('role_permissions', {
      roleId: { type: DataTypes.INTEGER, primaryKey: true },
      permissionId: { type: DataTypes.INTEGER, primaryKey: true },
    });
    await migration.up(q, DataTypes);
    await db.query("INSERT INTO companies VALUES (1,'One')");
    await db.query('INSERT INTO roles VALUES (1,1)');
    await db.query('INSERT INTO role_permissions VALUES (1,2)');
    const captured = await db.query<{ resourceType: string; companyId: number }>(
      'SELECT * FROM audit_capture_events',
      { type: QueryTypes.SELECT },
    );
    expect(captured).toHaveLength(3);
    expect(captured.find((r) => r.resourceType === 'role_permissions')?.companyId).toBe(1);
    await expect(
      db.transaction(async (tx) => {
        await db.query("UPDATE companies SET name='Rollback' WHERE id=1", { transaction: tx });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      await db.query('SELECT * FROM audit_capture_events', { type: QueryTypes.SELECT }),
    ).toHaveLength(3);
    const record = await services.core.append(event());
    const row = await services.core.repository.transaction(auditScope(1), (tx) =>
      services.core.repository.record(auditScope(1), record.auditRecordId, tx),
    );
    await q.bulkInsert('audit_records', [{ ...row, payload: JSON.stringify(row?.payload) }]);
    await expect(db.query("UPDATE audit_records SET severity='LOW'")).rejects.toThrow();
    await expect(db.query('DELETE FROM audit_records')).rejects.toThrow();
    await db.query(
      "CREATE TRIGGER fail_audit_capture BEFORE INSERT ON audit_capture_events BEGIN SELECT RAISE(ABORT,'capture unavailable'); END;",
    );
    await expect(db.query("UPDATE companies SET name='Rejected' WHERE id=1")).rejects.toThrow();
    expect(
      (
        await db.query<{ name: string }>('SELECT name FROM companies', { type: QueryTypes.SELECT })
      )[0].name,
    ).toBe('One');
  } finally {
    await db.close();
  }
});

