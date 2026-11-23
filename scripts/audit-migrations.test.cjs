'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Sequelize, DataTypes, QueryTypes } = require('sequelize');
const engine = require('../src/infra/database/migrations/20261116000010-create-audit-engine.js');
const projections = require('../src/infra/database/migrations/20261117000000-create-audit-projections.js');
test('SQL migrations: durable critical capture, rollback, redaction, relational projections and append-only guards', async () => {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }),
    q = db.getQueryInterface();
  try {
    await q.createTable('companies', {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      status: DataTypes.STRING,
    });
    await q.createTable('roles', {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      companyId: DataTypes.INTEGER,
    });
    await q.createTable('role_permissions', {
      roleId: { type: DataTypes.INTEGER, primaryKey: true },
      permissionId: { type: DataTypes.INTEGER, primaryKey: true },
    });
    for (const table of ['payroll_runs', 'payment_instructions', 'platform_billing_records'])
      await q.createTable(table, {
        id: { type: DataTypes.UUID, primaryKey: true },
        companyId: DataTypes.INTEGER,
        status: DataTypes.STRING,
        amount: DataTypes.STRING,
        data: DataTypes.JSON,
      });
    await q.createTable('communication_records', {
      id: { type: DataTypes.UUID, primaryKey: true },
      companyId: DataTypes.INTEGER,
      kind: DataTypes.STRING,
      key: DataTypes.STRING,
      status: DataTypes.STRING,
      data: DataTypes.JSON,
    });
    await engine.up(q, DataTypes);
    await projections.up(q);
    await db.query("INSERT INTO companies VALUES (1,'ACTIVE');");
    await db.query('INSERT INTO roles VALUES (1,1)');
    await db.query('INSERT INTO role_permissions VALUES (1,2)');
    const payroll = randomUUID(),
      payment = randomUUID();
    await db.query("INSERT INTO payroll_runs VALUES (:id,1,'APPROVED','1200.00','{}')", {
      replacements: { id: payroll },
    });
    await db.query("INSERT INTO payment_instructions VALUES (:id,1,'SETTLED','1200.00','{}')", {
      replacements: { id: payment },
    });
    await db.query("INSERT INTO platform_billing_records VALUES (:id,1,'PAID','1200.00',:data)", {
      replacements: {
        id: randomUUID(),
        data: JSON.stringify({ invoiceId: 'invoice-1', providerSecret: 'never-copy' }),
      },
    });
    const captured = await db.query('SELECT * FROM audit_capture_events', {
      type: QueryTypes.SELECT,
    });
    assert.equal(captured.length, 6);
    assert.equal(captured.find((r) => r.resourceType === 'role_permissions').companyId, 1);
    const financial = JSON.parse(
      captured.find((r) => r.resourceType === 'payment_instructions').payload,
    );
    assert.equal(financial.after.amount, '[REDACTED]');
    const billing = JSON.parse(
      captured.find((r) => r.resourceType === 'platform_billing_records').payload,
    );
    assert.equal(billing.after.links.invoiceId, 'invoice-1');
    assert.equal(JSON.stringify(billing).includes('never-copy'), false);
    await assert.rejects(
      db.transaction(async (transaction) => {
        await db.query("UPDATE payroll_runs SET status='CLOSED'", { transaction });
        throw new Error('rollback');
      }),
    );
    assert.equal(
      (await db.query('SELECT * FROM audit_capture_events', { type: QueryTypes.SELECT })).length,
      6,
    );
    const notificationId = randomUUID();
    await q.bulkInsert('communication_records', [
      {
        id: notificationId,
        companyId: 1,
        kind: 'MESSAGE',
        key: 'ordinary-message',
        status: 'PENDING',
        data: JSON.stringify({ body: 'private-content' }),
      },
    ]);
    const alertMessageId = randomUUID();
    await q.bulkInsert('communication_records', [
      {
        id: alertMessageId,
        companyId: 1,
        kind: 'MESSAGE',
        key: 'audit-alert:example',
        status: 'PENDING',
        data: '{}',
      },
    ]);
    await q.bulkInsert('communication_records', [
      {
        id: randomUUID(),
        companyId: 1,
        kind: 'DELIVERY',
        key: 'delivery-example',
        status: 'SENT',
        data: JSON.stringify({ messageId: alertMessageId }),
      },
    ]);
    const notifications = await db.query(
      "SELECT payload FROM audit_capture_events WHERE resourceType='communication_records'",
      { type: QueryTypes.SELECT },
    );
    assert.equal(notifications.length, 1);
    assert.equal(JSON.stringify(notifications).includes('private-content'), false);
    const id = randomUUID(),
      now = new Date(),
      hash = '0'.repeat(64);
    const record = {
      id,
      companyId: 1,
      scopeKey: 'tenant:1',
      eventId: randomUUID(),
      sourceId: 'sql-test',
      sequence: 1,
      schemaVersion: 1,
      eventType: 'payroll.changed',
      module: 'payroll',
      action: 'CHANGE',
      category: 'PAYROLL',
      severity: 'HIGH',
      outcome: 'SUCCESS',
      actorId: '7',
      resourceType: 'PAYROLL_RUN',
      resourceId: payroll,
      correlationId: 'correlation-1',
      sensitivity: 'SENSITIVE',
      occurredAt: now,
      receivedAt: now,
      policyVersion: 1,
      inputHash: hash,
      previousHash: hash,
      payloadHash: hash,
      recordHash: hash,
      payload: JSON.stringify({
        actor: { actorType: 'USER', actorId: '7' },
        changes: [{ field: 'amount', before: '[REDACTED]', after: '[REDACTED]' }],
        resource: { resourceVersion: '2' },
        requestId: 'request-1',
      }),
    };
    await q.bulkInsert('audit_records', [record]);
    assert.equal(
      (await db.query('SELECT actor_id FROM audit_actors', { type: QueryTypes.SELECT }))[0]
        .actor_id,
      '7',
    );
    assert.equal(
      (await db.query('SELECT * FROM audit_field_changes', { type: QueryTypes.SELECT }))[0]
        .field_path,
      'amount',
    );
    assert.equal(
      (await db.query('SELECT * FROM audit_contexts', { type: QueryTypes.SELECT }))[0].request_id,
      'request-1',
    );
    const workflow = (id, kind, data, status = 'ACTIVE') => ({
      id,
      companyId: 1,
      scopeKey: 'tenant:1',
      kind,
      key: id,
      status,
      data: JSON.stringify(data),
      createdAt: now,
      updatedAt: now,
    });
    await q.bulkInsert('audit_legal_holds', [
      workflow(randomUUID(), 'LEGAL_HOLD', { reason: 'Preserve all', wholeScope: true }),
    ]);
    assert.equal(
      (await db.query('SELECT * FROM audit_legal_hold_resources', { type: QueryTypes.SELECT }))
        .length,
      1,
    );
    const packageId = randomUUID(),
      exportId = randomUUID();
    await q.bulkInsert('audit_evidence_packages', [
      workflow(
        packageId,
        'EVIDENCE',
        { recordIds: [id], storageKey: 'private/example', checksum: hash },
        'READY',
      ),
    ]);
    await q.bulkInsert('audit_export_requests', [
      workflow(
        exportId,
        'EXPORT',
        { requesterId: 7, approverId: 8, decision: 'APPROVED', evidenceId: packageId },
        'READY',
      ),
    ]);
    assert.equal(
      (await db.query('SELECT * FROM audit_evidence_items', { type: QueryTypes.SELECT }))[0]
        .record_id,
      id,
    );
    assert.equal(
      (await db.query('SELECT * FROM audit_export_files', { type: QueryTypes.SELECT }))[0]
        .evidence_id,
      packageId,
    );
    assert.equal(
      (await db.query('SELECT * FROM audit_export_approvals', { type: QueryTypes.SELECT }))[0]
        .decision,
      'APPROVED',
    );
    await assert.rejects(db.query("UPDATE audit_records SET severity='LOW'"));
    await assert.rejects(db.query('DELETE FROM audit_records'));
    await assert.rejects(q.bulkInsert('audit_records', [{ ...record, id: randomUUID() }]));
    await db.query(
      "CREATE TRIGGER fail_capture BEFORE INSERT ON audit_capture_events BEGIN SELECT RAISE(ABORT,'capture unavailable'); END;",
    );
    await assert.rejects(db.query("UPDATE payroll_runs SET status='CLOSED'"));
    assert.equal(
      (await db.query('SELECT status FROM payroll_runs', { type: QueryTypes.SELECT }))[0].status,
      'APPROVED',
    );
    await projections.down(q);
    assert.equal(
      (await db.query('SELECT * FROM audit_records', { type: QueryTypes.SELECT })).length,
      1,
    );
  } finally {
    await db.close();
  }
});
