import request from 'supertest';
import { app } from '../../main/app';
import { CompanyMemberModel } from '../../modules/tenancy/infrastructure/persistence/models/company-member.model';
import { RoleModel } from '../../modules/user/infrastructure/persistence/models/role.model';
import { PermissionModel } from '../../modules/user/infrastructure/persistence/models/permission.model';
import { RolePermissionModel } from '../../modules/auth/infrastructure/persistence/models/role-permission.model';
import { AuditLogModel } from '../../modules/audit/infrastructure/persistence/models/audit-log.model';
import { SequelizeEmployeeRepository } from '../../modules/employees/infrastructure/persistence/repositories/sequelize-employee.repository';
import { createActor, TestActor } from '../support/auth';
import { resetTestDatabase } from '../support/database';

jest.setTimeout(60_000);

const auth = (actor: TestActor): [string, string] => ['Authorization', actor.authorization];

const tenant = (companyId: number | string): [string, string] => [
  'X-Company-Id',
  String(companyId),
];

describe('Employees module', () => {
  let actor: TestActor;
  let outsider: TestActor;
  let companyId: number;
  let employeeId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    actor = await createActor({ name: 'HR Admin' });
    outsider = await createActor({ name: 'Outsider' });

    const company = await request(app)
      .post('/api/v1/companies')
      .set(...auth(actor))
      .send({ name: 'Employee Tenant' });
    expect(company.status).toBe(201);
    companyId = company.body.data.id;

    const createdRole = await RoleModel.create({
      name: 'Employee administrator',
      description: 'Test-only role',
      isSystem: false,
      companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const permissionNames = [
      'employees.read',
      'employees.create',
      'employees.update',
      'employees.personal.read',
      'employees.personal.manage',
      'employees.history.read',
      'employees.bank_accounts.read',
      'employees.bank_accounts.manage',
      'employees.dependents.read',
      'employees.dependents.manage',
      'employees.status.manage',
      'employees.transfer',
      'employees.terminate',
      'employees.rehire',
      'employees.import',
      'employees.export',
    ];
    const permissions = await PermissionModel.findAll({
      where: { name: permissionNames },
    });
    await RolePermissionModel.bulkCreate(
      permissions.map((permission) => ({
        roleId: createdRole.id,
        permissionId: permission.id,
        createdAt: new Date(),
      })),
    );

    await CompanyMemberModel.update(
      { roleId: createdRole.id },
      { where: { companyId, userId: actor.userId } },
    );
  });

  it('requires an assigned tenant permission', async () => {
    const denied = await request(app)
      .get('/api/v1/company/employees')
      .set(...auth(outsider))
      .set(...tenant(companyId));
    expect(denied.status).toBe(403);
  });

  it('creates, lists and reads employees only within the active tenant', async () => {
    const created = await request(app)
      .post('/api/v1/company/employees')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        employeeNumber: 'EMP-001',
        firstName: 'Ana',
        lastName: 'Manuel',
        dateOfBirth: '1992-04-15',
        nationality: 'Angolana',
        admissionDate: '2024-01-02',
        departmentId: 2,
        jobTitle: 'Técnica de RH',
        jobCategory: 'Técnica',
      });

    expect(created.status).toBe(201);
    expect(created.body.data.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(created.body.data.status).toBe('ACTIVE');
    employeeId = created.body.data.id;

    const listed = await request(app)
      .get('/api/v1/company/employees')
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].id).toBe(employeeId);

    const read = await request(app)
      .get(`/api/v1/company/employees/${employeeId}`)
      .set(...auth(outsider))
      .set(...tenant(companyId));
    expect(read.status).toBe(403);

    const personal = await request(app)
      .get(`/api/v1/company/employees/${employeeId}/personal-info`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(personal.status).toBe(200);
    expect(personal.body.data.email).toBeNull();

    const updatedPersonal = await request(app)
      .patch(`/api/v1/company/employees/${employeeId}/personal-info`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ email: 'ana@example.test', phone: '+244900000001' });
    expect(updatedPersonal.status).toBe(200);
    expect(updatedPersonal.body.data.email).toBe('ana@example.test');

    const addedDependent = await request(app)
      .post(`/api/v1/company/employees/${employeeId}/dependents`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        fullName: 'Maria Manuel',
        relationship: 'Filha',
        dateOfBirth: '2018-06-15',
        fiscalDependent: true,
      });
    expect(addedDependent.status).toBe(201);
    const dependents = await request(app)
      .get(`/api/v1/company/employees/${employeeId}/dependents`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(dependents.body.data).toHaveLength(1);

    const savedBankAccount = await request(app)
      .put(`/api/v1/company/employees/${employeeId}/bank-account`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        bankName: 'Banco de Angola',
        accountName: 'Ana Manuel',
        accountNumber: '000123456',
        currency: 'AOA',
      });
    expect(savedBankAccount.status).toBe(200);
    const bankAccount = await request(app)
      .get(`/api/v1/company/employees/${employeeId}/bank-account`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(bankAccount.body.data.accountNumber).toBe('000123456');
  });

  it('preserves professional and status history through transfers, termination and rehire', async () => {
    const transfer = await request(app)
      .post(`/api/v1/company/employees/${employeeId}/transfers`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        departmentId: 5,
        jobTitle: 'Gestora de RH',
        jobCategory: 'Gestão',
        effectiveFrom: '2025-03-01',
        reason: 'Promoção',
      });

    expect(transfer.status).toBe(201);

    const terminated = await request(app)
      .post(`/api/v1/company/employees/${employeeId}/termination`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        effectiveAt: '2026-01-01',
        reason: 'Fim do vínculo',
        terminationReason: 'Cessação por mútuo acordo',
      });
    expect(terminated.status).toBe(200);
    expect(terminated.body.data.status).toBe('TERMINATED');

    const rehire = await request(app)
      .post(`/api/v1/company/employees/${employeeId}/rehire`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ effectiveAt: '2026-02-01', reason: 'Novo vínculo laboral' });
    expect(rehire.status).toBe(200);
    expect(rehire.body.data.status).toBe('ACTIVE');

    const history = await request(app)
      .get(`/api/v1/company/employees/${employeeId}/history`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(history.status).toBe(200);
    expect(history.body.data.professional).toHaveLength(2);
    expect(history.body.data.status.map((entry: { toStatus: string }) => entry.toStatus)).toEqual([
      'ACTIVE',
      'TERMINATED',
      'ACTIVE',
    ]);

    const repository = new SequelizeEmployeeRepository();
    const beforeTermination = await repository.snapshotAsOf(
      companyId,
      employeeId,
      new Date('2025-06-01T00:00:00.000Z'),
    );
    expect(beforeTermination).toMatchObject({
      status: 'ACTIVE',
      departmentId: 5,
      jobTitle: 'Gestora de RH',
    });
    const duringTermination = await repository.snapshotAsOf(
      companyId,
      employeeId,
      new Date('2026-01-15T00:00:00.000Z'),
    );
    expect(duringTermination?.status).toBe('TERMINATED');

    const audit = await AuditLogModel.findAll({
      where: { companyId, entityType: 'employee', entityId: employeeId },
    });
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        'employee.created',
        'employee.transferred',
        'employee.terminated',
        'employee.rehired',
      ]),
    );
    const bankAudit = await AuditLogModel.findAll({
      where: { companyId, entityType: 'employee_bank_account', entityId: employeeId },
    });
    expect(bankAudit.map((entry) => entry.action)).toContain('employee.bank_account.updated');
    expect(JSON.stringify(bankAudit.map((entry) => entry.after))).not.toContain('000123456');
  });

  it('imports per-record results and exports only permitted non-sensitive fields', async () => {
    const imported = await request(app)
      .post('/api/v1/company/employees/imports')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        employees: [
          {
            employeeNumber: 'EMP-002',
            firstName: '=Formula',
            lastName: 'Importado',
            email: 'private@example.test',
            admissionDate: '2024-02-01',
          },
          {
            employeeNumber: 'EMP-002',
            firstName: 'Duplicado',
            lastName: 'Importado',
            admissionDate: '2024-02-01',
          },
        ],
      });

    expect(imported.status).toBe(200);
    expect(imported.body.data).toMatchObject({
      total: 2,
      succeeded: 1,
      failed: 1,
    });
    expect(imported.body.data.results[1].success).toBe(false);

    const exported = await request(app)
      .get('/api/v1/company/employees/exports?format=csv')
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(exported.status).toBe(200);
    expect(exported.text).toContain("'=Formula");
    expect(exported.text).not.toContain('private@example.test');
  });

  it('does not expose employees across company boundaries and denies retroactive status changes', async () => {
    const company = await request(app)
      .post('/api/v1/companies')
      .set(...auth(outsider))
      .send({ name: 'Other Employee Tenant' });
    expect(company.status).toBe(201);

    const crossTenantRead = await request(app)
      .get(`/api/v1/company/employees/${employeeId}`)
      .set(...auth(outsider))
      .set(...tenant(company.body.data.id));
    expect(crossTenantRead.status).toBe(403);
    const repository = new SequelizeEmployeeRepository();
    await expect(repository.findById(company.body.data.id, employeeId)).resolves.toBeNull();

    const backdated = await request(app)
      .patch(`/api/v1/company/employees/${employeeId}/status`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        status: 'SUSPENDED',
        effectiveAt: '2025-01-01',
        reason: 'Data anterior à situação actual',
      });
    expect(backdated.status).toBe(422);
  });
});
