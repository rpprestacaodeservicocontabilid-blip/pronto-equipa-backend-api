import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../../main/app';
import { AuditLogModel } from '../../modules/audit/infrastructure/persistence/models/audit-log.model';
import { ContractOutboxModel } from '../../modules/contracts/infrastructure/persistence/models/contract-outbox.model';
import { ContractAlertModel } from '../../modules/contracts/infrastructure/persistence/models/contract-alert.model';
import { SequelizeContractRepository } from '../../modules/contracts/infrastructure/persistence/repositories/sequelize-contract.repository';
import { ContractRecordModel } from '../../modules/contracts/infrastructure/persistence/models/contract-record.model';
import { EmploymentContractModel } from '../../modules/contracts/infrastructure/persistence/models/employment-contract.model';
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

describe('Contracts module', () => {
  let creator: TestActor;
  let approver: TestActor;
  let outsider: TestActor;
  let companyId: number;
  let employeeId: string;
  let contractId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    creator = await createActor({ name: 'Contract preparer' });
    approver = await createActor({ name: 'Contract approver' });
    outsider = await createActor({ name: 'Contract outsider' });

    const company = await request(app)
      .post('/api/v1/companies')
      .set(...auth(creator))
      .send({ name: 'Contracts Tenant' });
    expect(company.status).toBe(201);
    companyId = company.body.data.id;

    const role = await RoleModel.create({
      name: 'Contract manager',
      description: 'Contract test permissions',
      isSystem: false,
      companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const permissionNames = [
      'contracts.read',
      'contracts.create',
      'contracts.update',
      'contracts.submit',
      'contracts.approve',
      'contracts.reject',
      'contracts.activate',
      'contracts.renew',
      'contracts.amend',
      'contracts.suspend',
      'contracts.resume',
      'contracts.terminate',
      'contracts.documents.read',
      'contracts.documents.manage',
      'contracts.history.read',
      'contracts.types.manage',
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
      { where: { companyId, userId: creator.userId } },
    );
    await CompanyMemberModel.create({
      companyId,
      userId: approver.userId,
      roleId: role.id,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    employeeId = randomUUID();
    await EmployeeModel.create({
      id: employeeId,
      companyId,
      employeeNumber: 'CON-EMP-001',
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

  it('requires contract permissions and validates employee tenancy', async () => {
    const denied = await request(app)
      .get('/api/v1/contracts')
      .set(...auth(outsider))
      .set(...tenant(companyId));
    expect(denied.status).toBe(403);

    const missingEmployee = await request(app)
      .post('/api/v1/contracts')
      .set(...auth(creator))
      .set(...tenant(companyId))
      .send({
        employeeId: randomUUID(),
        contractNumber: 'CON-404',
        typeCode: 'FIXED',
        startDate: '2025-01-01',
        endDate: '2026-01-01',
      });
    expect(missingEmployee.status).toBe(404);
  });

  it('enforces draft, approval, activation and segregated approval with version history', async () => {
    const type = await request(app)
      .post('/api/v1/contracts/types')
      .set(...auth(creator))
      .set(...tenant(companyId))
      .send({
        code: 'FIXED',
        name: 'Prazo configurável',
        requiresEndDate: true,
        maxRenewals: 1,
      });
    expect(type.status).toBe(201);

    const created = await request(app)
      .post('/api/v1/contracts')
      .set(...auth(creator))
      .set(...tenant(companyId))
      .send({
        employeeId,
        contractNumber: 'CON-001',
        typeCode: 'FIXED',
        startDate: '2025-01-01',
        endDate: '2030-01-01',
        currency: 'AOA',
        salaryAmount: 125000,
        terms: { workingSchedule: 'FULL_TIME' },
      });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('DRAFT');
    contractId = created.body.data.id;

    const submit = await request(app)
      .post(`/api/v1/contracts/${contractId}/submit`)
      .set(...auth(creator))
      .set(...tenant(companyId))
      .send({ expectedVersion: 1 });
    expect(submit.status).toBe(200);
    expect(submit.body.data.status).toBe('PENDING_APPROVAL');

    const selfApprove = await request(app)
      .post(`/api/v1/contracts/${contractId}/approve`)
      .set(...auth(creator))
      .set(...tenant(companyId))
      .send({ expectedVersion: 2 });
    expect(selfApprove.status).toBe(403);

    const approved = await request(app)
      .post(`/api/v1/contracts/${contractId}/approve`)
      .set(...auth(approver))
      .set(...tenant(companyId))
      .send({ expectedVersion: 2 });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('APPROVED');

    const activated = await request(app)
      .post(`/api/v1/contracts/${contractId}/activate`)
      .set(...auth(approver))
      .set(...tenant(companyId))
      .send({ expectedVersion: 3 });
    expect(activated.status).toBe(200);
    expect(activated.body.data.status).toBe('ACTIVE');

    const history = await request(app)
      .get(`/api/v1/contracts/${contractId}/history`)
      .set(...auth(creator))
      .set(...tenant(companyId));
    expect(history.status).toBe(200);
    expect(history.body.data.map((record: { type: string }) => record.type)).toEqual(
      expect.arrayContaining(['CREATED', 'SUBMITTED', 'APPROVED', 'ACTIVE']),
    );

    const outbox = await ContractOutboxModel.findAll({
      where: { companyId, aggregateId: contractId },
    });
    expect(outbox.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        'contracts.created',
        'contracts.submitted',
        'contracts.approved',
        'contracts.activated',
      ]),
    );
    const audit = await AuditLogModel.findAll({
      where: { companyId, entityType: 'employment_contract', entityId: contractId },
    });
    expect(audit.map((entry) => entry.action)).toContain('contracts.approved');
  });

  it('versions renewals, prevents excess renewal and isolates contract lookups', async () => {
    const renewed = await request(app)
      .post(`/api/v1/contracts/${contractId}/renewals`)
      .set(...auth(creator))
      .set(...tenant(companyId))
      .send({ expectedVersion: 4, newEndDate: '2031-01-01', reason: 'Renovação aprovada' });
    expect(renewed.status).toBe(201);
    expect(renewed.body.data.endDate).toBe('2031-01-01');

    const deniedRenewal = await request(app)
      .post(`/api/v1/contracts/${contractId}/renewals`)
      .set(...auth(creator))
      .set(...tenant(companyId))
      .send({ expectedVersion: 5, newEndDate: '2032-01-01', reason: 'Limite de renovação' });
    expect(deniedRenewal.status).toBe(409);

    const otherCompany = await request(app)
      .post('/api/v1/companies')
      .set(...auth(outsider))
      .send({ name: 'Different contract tenant' });
    expect(otherCompany.status).toBe(201);
    await CompanyMemberModel.create({
      companyId: otherCompany.body.data.id,
      userId: creator.userId,
      roleId: (await RoleModel.findOne({ where: { companyId } }))!.id,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const crossTenant = await request(app)
      .get(`/api/v1/contracts/${contractId}`)
      .set(...auth(creator))
      .set(...tenant(otherCompany.body.data.id));
    expect(crossTenant.status).toBe(404);

    const row = await EmploymentContractModel.findByPk(contractId);
    expect(row?.version).toBe(5);
    const records = await ContractRecordModel.findAll({ where: { companyId, contractId } });
    expect(records.map((record) => record.type)).toContain('RENEWAL');

    await EmploymentContractModel.update(
      { endDate: '2026-01-31' },
      { where: { companyId, id: contractId } },
    );
    const repository = new SequelizeContractRepository();
    await expect(repository.generateExpirationAlerts(companyId, '2026-01-01')).resolves.toBe(1);
    await expect(repository.generateExpirationAlerts(companyId, '2026-01-01')).resolves.toBe(0);
    const alerts = await ContractAlertModel.findAll({ where: { companyId, contractId } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].alertType).toBe('30_DAYS');

    await expect(repository.expireEndedContracts(companyId, '2026-02-01')).resolves.toBe(1);
    await expect(repository.expireEndedContracts(companyId, '2026-02-01')).resolves.toBe(0);
    await expect(EmploymentContractModel.findByPk(contractId)).resolves.toMatchObject({
      status: 'EXPIRED',
    });
    const expiryEvents = await ContractOutboxModel.findAll({
      where: { companyId, aggregateId: contractId, eventType: 'contracts.expired' },
    });
    expect(expiryEvents).toHaveLength(1);
  });
});
