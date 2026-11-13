import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../../main/app';
import { sequelize } from '../../infra/database';
import { AttendanceRecordModel } from '../../modules/attendance/infrastructure/persistence/model/attendance-record.model';
import { CompanyMemberModel } from '../../modules/tenancy/infrastructure/persistence/model/company-member.model';
import { EmployeeModel } from '../../modules/employees/infrastructure/persistence/model/employee.model';
import { PermissionModel } from '../../modules/user/infrastructure/persistence/models/permission.model';
import { RoleModel } from '../../modules/user/infrastructure/persistence/models/role.model';
import { RolePermissionModel } from '../../modules/auth/infrastructure/persistence/model/role-permission.model';
import { createActor, TestActor } from '../support/auth';
import { resetTestDatabase } from '../support/database';

jest.setTimeout(60_000);

const auth = (actor: TestActor): [string, string] => ['Authorization', actor.authorization];
const tenant = (companyId: number | string): [string, string] => [
  'X-Company-Id',
  String(companyId),
];

describe('Attendance module', () => {
  let actor: TestActor;
  let reviewer: TestActor;
  let outsider: TestActor;
  let companyId: number;
  let employeeId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    actor = await createActor({ name: 'Attendance operator' });
    reviewer = await createActor({ name: 'Attendance reviewer' });
    outsider = await createActor({ name: 'Attendance outsider' });
    const company = await request(app)
      .post('/api/v1/companies')
      .set(...auth(actor))
      .send({ name: 'Attendance Tenant' });
    expect(company.status).toBe(201);
    companyId = company.body.data.id;

    const role = await RoleModel.create({
      name: 'Attendance manager',
      description: 'Attendance integration test',
      isSystem: false,
      companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const permissionNames = [
      'attendance.punches.create',
      'attendance.punches.read',
      'attendance.days.calculate',
      'attendance.days.read',
      'attendance.corrections.create',
      'attendance.corrections.read',
      'attendance.corrections.decide',
      'attendance.periods.manage',
      'attendance.periods.read',
      'attendance.periods.close',
      'attendance.imports.create',
      'attendance.reports.read',
    ];
    const permissions = await PermissionModel.findAll({ where: { name: permissionNames } });
    await RolePermissionModel.bulkCreate(
      permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
        createdAt: new Date(),
      })),
    );
    await CompanyMemberModel.update(
      { roleId: role.id },
      { where: { companyId, userId: actor.userId } },
    );
    await CompanyMemberModel.create({
      companyId,
      userId: reviewer.userId,
      roleId: role.id,
      status: 'ACTIVE',
      invitedBy: actor.userId,
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    employeeId = randomUUID();
    await EmployeeModel.create({
      id: employeeId,
      companyId,
      employeeNumber: 'ATT-001',
      firstName: 'Ana',
      lastName: 'Manuel',
      dateOfBirth: null,
      nationality: null,
      email: null,
      phone: null,
      admissionDate: new Date('2024-01-01T00:00:00.000Z'),
      departmentId: null,
      jobTitle: null,
      jobCategory: null,
      status: 'ACTIVE',
      terminationDate: null,
      terminationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('keeps punch records tenant-scoped, idempotent and immutable through correction and period close', async () => {
    const denied = await request(app)
      .get('/api/v1/attendance/punches')
      .set(...auth(outsider))
      .set(...tenant(companyId));
    expect(denied.status).toBe(403);

    const punchIn = await request(app)
      .post('/api/v1/attendance/punches')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        employeeId,
        punchType: 'IN',
        occurredAt: '2026-03-02T08:00:00.000Z',
        idempotencyKey: 'attendance-in-1',
      });
    expect(punchIn.status).toBe(201);

    const duplicate = await request(app)
      .post('/api/v1/attendance/punches')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        employeeId,
        punchType: 'IN',
        occurredAt: '2026-03-02T08:00:00.000Z',
        idempotencyKey: 'attendance-in-1',
      });
    expect(duplicate.status).toBe(201);
    const conflictingRetry = await request(app)
      .post('/api/v1/attendance/punches')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        employeeId,
        punchType: 'IN',
        occurredAt: '2026-03-02T08:01:00.000Z',
        idempotencyKey: 'attendance-in-1',
      });
    expect(conflictingRetry.status).toBe(409);

    const punchOut = await request(app)
      .post('/api/v1/attendance/punches')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        employeeId,
        punchType: 'OUT',
        occurredAt: '2026-03-02T16:00:00.000Z',
        idempotencyKey: 'attendance-out-1',
      });
    expect(punchOut.status).toBe(201);

    const calculated = await request(app)
      .post('/api/v1/attendance/days/recalculate')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ employeeId, workDate: '2026-03-02' });
    expect(calculated.status).toBe(200);
    expect(calculated.body.data.data.workedMinutes).toBe(480);

    const correction = await request(app)
      .post(`/api/v1/attendance/punches/${punchIn.body.data.id}/corrections`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ occurredAt: '2026-03-02T07:55:00.000Z', reason: 'Correct device time' });
    expect(correction.status).toBe(201);

    const selfApproval = await request(app)
      .post(`/api/v1/attendance/corrections/${correction.body.data.id}/decision`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ decision: 'APPROVED' });
    expect(selfApproval.status).toBe(403);

    const approved = await request(app)
      .post(`/api/v1/attendance/corrections/${correction.body.data.id}/decision`)
      .set(...auth(reviewer))
      .set(...tenant(companyId))
      .send({ decision: 'APPROVED' });
    expect(approved.status).toBe(200);
    expect(await AttendanceRecordModel.count({ where: { companyId } })).toBe(3);

    const recalculated = await request(app)
      .post('/api/v1/attendance/days/recalculate')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ employeeId, workDate: '2026-03-02' });
    expect(recalculated.body.data.data.workedMinutes).toBe(485);

    for (const [punchType, occurredAt, idempotencyKey] of [
      ['BREAK_START', '2026-03-02T12:00:00.000Z', 'attendance-break-start'],
      ['BREAK_END', '2026-03-02T12:30:00.000Z', 'attendance-break-end'],
    ]) {
      const additionalPunch = await request(app)
        .post('/api/v1/attendance/punches')
        .set(...auth(actor))
        .set(...tenant(companyId))
        .send({ employeeId, punchType, occurredAt, idempotencyKey });
      expect(additionalPunch.status).toBe(201);
    }

    const period = await request(app)
      .post('/api/v1/attendance/periods')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(period.status).toBe(201);
    const validated = await request(app)
      .post(`/api/v1/attendance/periods/${period.body.data.id}/validate`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(validated.status).toBe(200);
    expect(validated.body.data.readyToClose).toBe(false);
    expect(validated.body.data.staleDays).toBe(1);
    const refreshedDay = await request(app)
      .post('/api/v1/attendance/days/recalculate')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ employeeId, workDate: '2026-03-02' });
    expect(refreshedDay.body.data.data.workedMinutes).toBe(455);
    const ready = await request(app)
      .post(`/api/v1/attendance/periods/${period.body.data.id}/validate`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(ready.body.data.readyToClose).toBe(true);
    const closed = await request(app)
      .post(`/api/v1/attendance/periods/${period.body.data.id}/close`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(closed.status).toBe(200);
    const rectification = await request(app)
      .post(`/api/v1/attendance/periods/${period.body.data.id}/rectifications`)
      .set(...auth(reviewer))
      .set(...tenant(companyId))
      .send({
        recordId: punchIn.body.data.id,
        occurredAt: '2026-03-02T07:50:00.000Z',
        reason: 'Correct after close',
      });
    expect(rectification.status).toBe(201);
    const approvedRectification = await request(app)
      .post(`/api/v1/attendance/corrections/${rectification.body.data.id}/approve`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(approvedRectification.status).toBe(200);
    const snapshots = await request(app)
      .get(`/api/v1/attendance/periods/${period.body.data.id}/snapshots`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(snapshots.status).toBe(200);
    expect(snapshots.body.data[0].data.days[0].data.workedMinutes).toBe(455);

    const afterClose = await request(app)
      .post('/api/v1/attendance/punches')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        employeeId,
        punchType: 'IN',
        occurredAt: '2026-03-02T08:01:00.000Z',
        idempotencyKey: 'late-attendance-in',
      });
    expect(afterClose.status).toBe(409);

    const imported = await request(app)
      .post('/api/v1/attendance/punches/import')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        batchKey: 'attendance-import-1',
        rows: [
          {
            employeeId,
            punchType: 'IN',
            occurredAt: '2026-04-02T08:00:00.000Z',
          },
          {
            employeeId: randomUUID(),
            punchType: 'OUT',
            occurredAt: '2026-04-02T16:00:00.000Z',
          },
        ],
      });
    expect(imported.status).toBe(200);
    expect(imported.body.data.batch.status).toBe('COMPLETED_WITH_ERRORS');
    expect(imported.body.data.items).toHaveLength(2);
    expect(imported.body.data.items[1].status).toBe('ERROR');

    const report = await request(app)
      .get('/api/v1/attendance/reports/summary')
      .query({ from: '2026-03-01', to: '2026-03-31' })
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(report.status).toBe(200);
    expect(report.body.data.dayCount).toBe(1);
  });

  it('runs the attendance schema migration up and down on SQLite', async () => {
    const queryInterface = sequelize.getQueryInterface();
    for (const table of ['attendance_outbox', 'attendance_entities', 'attendance_records']) {
      await queryInterface.dropTable(table);
    }
    const migration =
      require('../../infra/database/migrations/20261109000012-create-attendance.js') as {
        up(queryInterface: unknown, Sequelize: unknown): Promise<void>;
        down(queryInterface: unknown): Promise<void>;
      };
    await migration.up(queryInterface, require('sequelize'));
    expect(await queryInterface.describeTable('attendance_records')).toHaveProperty('occurredAt');
    await migration.down(queryInterface);
  });
});
