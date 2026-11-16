import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../../main/app';
import { OrganizationHistoryModel } from '../../modules/organization/infrastructure/persistence/models/organization-history.model';
import { OrganizationOutboxModel } from '../../modules/organization/infrastructure/persistence/models/organization-outbox.model';
import { OrganizationRecordModel } from '../../modules/organization/infrastructure/persistence/models/organization-record.model';
import { CompanyMemberModel } from '../../modules/tenancy/infrastructure/persistence/models/company-member.model';
import { EmployeeModel } from '../../modules/employees/infrastructure/persistence/models/employee.model';
import { PermissionModel } from '../../modules/user/infrastructure/persistence/models/permission.model';
import { RoleModel } from '../../modules/user/infrastructure/persistence/models/role.model';
import { RolePermissionModel } from '../../modules/auth/infrastructure/persistence/models/role-permission.model';
import { createActor, TestActor } from '../support/auth';
import { resetTestDatabase } from '../support/database';

jest.setTimeout(60_000);

const auth = (actor: TestActor): [string, string] => ['Authorization', actor.authorization];
const tenant = (companyId: number | string): [string, string] => [
  'X-Company-Id',
  String(companyId),
];

describe('Organization module', () => {
  let actor: TestActor;
  let outsider: TestActor;
  let companyId: number;
  let employeeId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    actor = await createActor({ name: 'Organization administrator' });
    outsider = await createActor({ name: 'Organization outsider' });
    const company = await request(app)
      .post('/api/v1/companies')
      .set(...auth(actor))
      .send({ name: 'Organization Tenant' });
    expect(company.status).toBe(201);
    companyId = company.body.data.id;

    const role = await RoleModel.create({
      name: 'Organization manager',
      description: 'Organization integration test',
      isSystem: false,
      companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const permissions = await PermissionModel.findAll({
      where: {
        name: [
          'organization:read',
          'organization:departments:create',
          'organization:departments:update',
          'organization:departments:deactivate',
          'organization:hierarchy:manage',
          'organization:functions:manage',
          'organization:positions:manage',
          'organization:categories:manage',
          'organization:cost-centers:manage',
          'organization:cost-allocations:manage',
          'organization:establishments:manage',
          'organization:calendars:manage',
          'organization:schedules:manage',
          'organization:history:read',
        ],
      },
    });
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

    employeeId = randomUUID();
    await EmployeeModel.create({
      id: employeeId,
      companyId,
      employeeNumber: 'ORG-EMP-001',
      firstName: 'Joana',
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

  it('secures departments by tenant, prevents duplicate codes and circular hierarchy', async () => {
    const denied = await request(app)
      .get('/api/v1/organization/departments')
      .set(...auth(outsider))
      .set(...tenant(companyId));
    expect(denied.status).toBe(403);

    const parent = await request(app)
      .post('/api/v1/organization/departments')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ code: 'HR', name: 'Recursos Humanos', data: { managerEmployeeId: employeeId } });
    expect(parent.status).toBe(201);

    const duplicate = await request(app)
      .post('/api/v1/organization/departments')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ code: 'HR', name: 'Duplicado' });
    expect(duplicate.status).toBe(409);

    const child = await request(app)
      .post('/api/v1/organization/departments')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ code: 'HR-OPS', name: 'Operações RH', parentId: parent.body.data.id });
    expect(child.status).toBe(201);

    const cycle = await request(app)
      .patch(`/api/v1/organization/departments/${parent.body.data.id}/parent`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ expectedVersion: 1, parentId: child.body.data.id });
    expect(cycle.status).toBe(409);

    const tree = await request(app)
      .get('/api/v1/organization/departments/tree')
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(tree.status).toBe(200);
    expect(tree.body.data[0].children[0].id).toBe(child.body.data.id);

    const updatedParent = await request(app)
      .patch(`/api/v1/organization/departments/${parent.body.data.id}`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ expectedVersion: 1, name: 'Direcção de Recursos Humanos' });
    expect(updatedParent.status).toBe(200);
    expect(updatedParent.body.data.version).toBe(2);
    const staleUpdate = await request(app)
      .patch(`/api/v1/organization/departments/${parent.body.data.id}`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ expectedVersion: 1, name: 'Actualização obsoleta' });
    expect(staleUpdate.status).toBe(409);

    const assigned = await request(app)
      .post(`/api/v1/organization/departments/${parent.body.data.id}/employees`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        code: 'EMP-PRIMARY',
        name: 'Afectação principal',
        employeeId,
        effectiveFrom: '2025-01-01',
        data: { assignmentType: 'PRIMARY' },
      });
    expect(assigned.status).toBe(201);
    const deactivateAssigned = await request(app)
      .post(`/api/v1/organization/departments/${parent.body.data.id}/deactivate`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ expectedVersion: 2 });
    expect(deactivateAssigned.status).toBe(409);

    const history = await request(app)
      .get(`/api/v1/organization/departments/${parent.body.data.id}/history`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(history.status).toBe(200);
    expect(history.body.data.map((record: { changeType: string }) => record.changeType)).toContain(
      'CREATED',
    );
  });

  it('validates cost allocation totals, work-shift overlaps and emits durable history events', async () => {
    const first = await request(app)
      .post('/api/v1/organization/cost-centers')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ code: 'CC-1', name: 'Centro A' });
    const second = await request(app)
      .post('/api/v1/organization/cost-centers')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ code: 'CC-2', name: 'Centro B' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const invalidAllocation = await request(app)
      .post('/api/v1/organization/cost-allocations')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        employeeId,
        effectiveFrom: '2025-01-01',
        allocations: [
          { costCenterId: first.body.data.id, percentage: 40 },
          { costCenterId: second.body.data.id, percentage: 50 },
        ],
      });
    expect(invalidAllocation.status).toBe(422);

    const allocation = await request(app)
      .post('/api/v1/organization/cost-allocations')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        employeeId,
        effectiveFrom: '2025-01-01',
        allocations: [
          { costCenterId: first.body.data.id, percentage: 40 },
          { costCenterId: second.body.data.id, percentage: 60 },
        ],
      });
    expect(allocation.status).toBe(201);
    expect(allocation.body.data).toHaveLength(2);

    const schedule = await request(app)
      .post('/api/v1/organization/schedules')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        code: 'DAY',
        name: 'Horário diurno',
        effectiveFrom: '2025-01-01',
        effectiveTo: '2030-01-01',
        data: {
          scheduleType: 'FIXED',
          weeklyMinutes: 2400,
          shifts: [
            { weekday: 1, startTime: '08:00', endTime: '12:00', breakMinutes: 0 },
            { weekday: 1, startTime: '11:30', endTime: '15:00', breakMinutes: 0 },
          ],
        },
      });
    expect(schedule.status).toBe(409);

    const validSchedule = await request(app)
      .post('/api/v1/organization/schedules')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        code: 'NIGHT',
        name: 'Turno nocturno',
        effectiveFrom: '2025-01-01',
        effectiveTo: '2030-01-01',
        data: {
          scheduleType: 'SHIFT',
          weeklyMinutes: 2400,
          shifts: [
            {
              weekday: 1,
              startTime: '22:00',
              endTime: '06:00',
              crossesMidnight: true,
              breakMinutes: 30,
            },
          ],
        },
      });
    expect(validSchedule.status).toBe(201);

    const calendar = await request(app)
      .post('/api/v1/organization/calendars')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        code: 'AO-2026',
        name: 'Calendário laboral 2026',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
        data: { workingWeekdays: [1, 2, 3, 4, 5] },
      });
    expect(calendar.status).toBe(201);
    const holiday = await request(app)
      .post(`/api/v1/organization/calendars/${calendar.body.data.id}/exceptions`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        code: 'HOLIDAY-2026-01-01',
        name: 'Feriado',
        effectiveFrom: '2026-01-01',
        data: { dayType: 'HOLIDAY', description: 'Feriado nacional' },
      });
    expect(holiday.status).toBe(201);

    const nightShift = await request(app)
      .post(`/api/v1/organization/schedules/${validSchedule.body.data.id}/shifts`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        code: 'TUE-NIGHT',
        name: 'Turno de terça-feira',
        data: {
          weekday: 2,
          startTime: '22:00',
          endTime: '06:00',
          crossesMidnight: true,
          breakMinutes: 30,
        },
      });
    expect(nightShift.status).toBe(201);
    const overlappingNextDay = await request(app)
      .post(`/api/v1/organization/schedules/${validSchedule.body.data.id}/shifts`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        code: 'WED-EARLY',
        name: 'Turno de quarta-feira',
        data: {
          weekday: 3,
          startTime: '05:00',
          endTime: '07:00',
          crossesMidnight: false,
          breakMinutes: 0,
        },
      });
    expect(overlappingNextDay.status).toBe(409);

    const records = await OrganizationRecordModel.findAll({ where: { companyId } });
    const history = await OrganizationHistoryModel.findAll({ where: { companyId } });
    const outbox = await OrganizationOutboxModel.findAll({ where: { companyId } });
    expect(records.length).toBeGreaterThanOrEqual(8);
    expect(history.length).toBeGreaterThan(records.length - 1);
    expect(outbox.map((event) => event.eventType)).toContain(
      'organization.cost-allocation.created',
    );
  });

  it('does not expose organization records through a different tenant context', async () => {
    const company = await request(app)
      .post('/api/v1/companies')
      .set(...auth(outsider))
      .send({ name: 'Other Organization Tenant' });
    expect(company.status).toBe(201);
    const role = await RoleModel.findOne({ where: { companyId } });
    await CompanyMemberModel.create({
      companyId: company.body.data.id,
      userId: actor.userId,
      roleId: role!.id,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const record = await OrganizationRecordModel.findOne({
      where: { companyId, type: 'DEPARTMENT' },
    });
    const crossTenant = await request(app)
      .get(`/api/v1/organization/departments/${record!.id}`)
      .set(...auth(actor))
      .set(...tenant(company.body.data.id));
    expect(crossTenant.status).toBe(404);
  });
});
