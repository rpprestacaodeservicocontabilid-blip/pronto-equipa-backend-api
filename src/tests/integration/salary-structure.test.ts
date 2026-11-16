import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../../main/app';
import { AuditLogModel } from '../../modules/audit/infrastructure/persistence/models/audit-log.model';
import { EmploymentContractModel } from '../../modules/contracts/infrastructure/persistence/models/employment-contract.model';
import { EmployeeModel } from '../../modules/employees/infrastructure/persistence/models/employee.model';
import { CompanyMemberModel } from '../../modules/tenancy/infrastructure/persistence/models/company-member.model';
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

describe('Salary structure module', () => {
  let actor: TestActor;
  let approver: TestActor;
  let observer: TestActor;
  let foreignActor: TestActor;
  let companyId: number;
  let foreignCompanyId: number;
  let employeeId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    actor = await createActor({ name: 'Salary structure operator' });
    approver = await createActor({ name: 'Salary structure approver' });
    observer = await createActor({ name: 'Salary structure observer' });
    foreignActor = await createActor({ name: 'Foreign tenant owner' });

    const companyResponse = await request(app)
      .post('/api/v1/companies')
      .set(...auth(actor))
      .send({ name: 'Salary Structure Tenant' });
    expect(companyResponse.status).toBe(201);
    companyId = companyResponse.body.data.id;

    const foreignCompanyResponse = await request(app)
      .post('/api/v1/companies')
      .set(...auth(foreignActor))
      .send({ name: 'Foreign Salary Tenant' });
    expect(foreignCompanyResponse.status).toBe(201);
    foreignCompanyId = foreignCompanyResponse.body.data.id;

    const role = await RoleModel.create({
      name: 'Salary structure operator',
      description: 'Salary structure integration test',
      isSystem: false,
      companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const permissionNames = [
      'salary-structure:read',
      'salary-structure:components:create',
      'salary-structure:components:publish',
      'salary-structure:structures:create',
      'salary-structure:structures:update',
      'salary-structure:structures:approve',
      'salary-structure:structures:publish',
      'salary-structure:assignments:manage',
      'salary-structure:assignments:read',
      'salary-structure:history:read',
      'salary-structure:simulations:run',
      'salary-structure:revisions:create',
      'salary-structure:revisions:read',
      'salary-structure:revisions:approve',
      'salary-structure:revisions:apply',
      'salary-structure:revisions:batch',
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
    const emptyRole = await RoleModel.create({
      name: 'Salary structure observer',
      description: 'No salary permissions',
      isSystem: false,
      companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    for (const member of [approver, observer]) {
      await CompanyMemberModel.create({
        companyId,
        userId: member.userId,
        roleId: member === approver ? role.id : emptyRole.id,
        status: 'ACTIVE',
        invitedBy: actor.userId,
        joinedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    employeeId = randomUUID();
    const now = new Date();
    await EmployeeModel.create({
      id: employeeId,
      companyId,
      employeeNumber: 'SALARY-001',
      firstName: 'Ana',
      lastName: 'Manuel',
      dateOfBirth: null,
      nationality: null,
      email: null,
      phone: null,
      admissionDate: now,
      departmentId: null,
      jobTitle: null,
      jobCategory: null,
      status: 'ACTIVE',
      terminationDate: null,
      terminationReason: null,
      createdAt: now,
      updatedAt: now,
    });
    await EmploymentContractModel.create({
      id: randomUUID(),
      companyId,
      employeeId,
      contractNumber: 'SALARY-C-001',
      typeCode: 'PERMANENT',
      legalRuleVersionId: null,
      status: 'ACTIVE',
      startDate: now.toISOString().slice(0, 10),
      endDate: null,
      currency: 'AOA',
      salaryAmount: '100000.00',
      terms: {},
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  });

  it('enforces tenant permissions and records an approved salary structure and snapshot', async () => {
    const denied = await request(app)
      .get('/api/v1/salary-structure/components')
      .set(...auth(observer))
      .set(...tenant(companyId));
    expect(denied.status).toBe(403);

    const crossTenant = await request(app)
      .get('/api/v1/salary-structure/components')
      .set(...auth(actor))
      .set(...tenant(foreignCompanyId));
    expect(crossTenant.status).toBe(403);

    const today = new Date().toISOString().slice(0, 10);
    const componentResponse = await request(app)
      .post('/api/v1/salary-structure/components')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        code: 'TRANSPORT',
        name: 'Transport allowance',
        componentType: 'ALLOWANCE',
        calculationMethod: 'PERCENTAGE',
        frequency: 'MONTHLY',
        currency: 'AOA',
        effectiveFrom: today,
      });
    expect(componentResponse.status).toBe(201);
    const componentVersionId = componentResponse.body.data.version.id as string;
    const componentId = componentResponse.body.data.component.id as string;

    const publishedComponent = await request(app)
      .post(
        `/api/v1/salary-structure/components/${componentId}/versions/${componentVersionId}/publish`,
      )
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(publishedComponent.status).toBe(200);

    const structureResponse = await request(app)
      .post('/api/v1/salary-structure/structures')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        code: 'STANDARD',
        name: 'Standard remuneration',
        effectiveFrom: today,
        items: [{ componentVersionId, percentage: '10', required: true }],
      });
    expect(structureResponse.status).toBe(201);
    const structureId = structureResponse.body.data.structure.id as string;
    const structureVersionId = structureResponse.body.data.version.id as string;

    const submitted = await request(app)
      .post(`/api/v1/salary-structure/structures/${structureId}/submit`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(submitted.status).toBe(200);

    const selfApproval = await request(app)
      .post(`/api/v1/salary-structure/structures/${structureId}/decision`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ decision: 'APPROVED' });
    expect(selfApproval.status).toBe(403);

    const approved = await request(app)
      .post(`/api/v1/salary-structure/structures/${structureId}/decision`)
      .set(...auth(approver))
      .set(...tenant(companyId))
      .send({ decision: 'APPROVED' });
    expect(approved.status).toBe(200);

    const published = await request(app)
      .post(`/api/v1/salary-structure/structures/${structureId}/publish`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(published.status).toBe(200);
    expect(published.body.data.id).toBe(structureVersionId);

    const simulation = await request(app)
      .post('/api/v1/salary-structure/simulations')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        baseSalary: '100000.00',
        currency: 'AOA',
        effectiveDate: today,
        structureVersionId,
        components: [],
      });
    expect(simulation.status).toBe(200);
    expect(simulation.body.data.totalRecurring).toBe('110000.00');

    const assignment = await request(app)
      .post('/api/v1/salary-structure/assignments')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        employeeId,
        contractId: (await EmploymentContractModel.findOne({ where: { companyId, employeeId } }))
          ?.id,
        structureVersionId,
        effectiveFrom: today,
        baseSalary: '100000.00',
        currency: 'AOA',
      });
    expect(assignment.status).toBe(201);

    const currentSalary = await request(app)
      .get(`/api/v1/salary-structure/employees/${employeeId}/current`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(currentSalary.status).toBe(200);
    expect(currentSalary.body.data.components).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TRANSPORT', amount: '10000.00' })]),
    );

    const snapshot = await request(app)
      .get(`/api/v1/salary-structure/employees/${employeeId}/snapshot`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.data.resolvedComponents).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'TRANSPORT', amount: '10000.00' })]),
    );

    const audit = await AuditLogModel.findOne({
      where: { companyId, actorUserId: actor.userId, action: 'salary-structure.component.created' },
    });
    expect(audit).not.toBeNull();

    const tomorrowDate = new Date(`${today}T00:00:00.000Z`);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const effectiveDate = tomorrowDate.toISOString().slice(0, 10);
    const contract = await EmploymentContractModel.findOne({ where: { companyId, employeeId } });
    await contract?.update({ salaryAmount: '120000.00' });
    const revision = await request(app)
      .post('/api/v1/salary-structure/revisions')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        employeeId,
        previousAssignmentId: assignment.body.data.id,
        effectiveFrom: effectiveDate,
        reason: 'Annual salary adjustment',
        proposedData: {
          baseSalary: '120000.00',
          currency: 'AOA',
          structureVersionId,
          components: [],
        },
      });
    expect(revision.status).toBe(201);
    const submittedRevision = await request(app)
      .post(`/api/v1/salary-structure/revisions/${revision.body.data.id}/submit`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(submittedRevision.status).toBe(200);

    const selfRevisionApproval = await request(app)
      .post(`/api/v1/salary-structure/revisions/${revision.body.data.id}/decision`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ decision: 'APPROVED' });
    expect(selfRevisionApproval.status).toBe(403);

    const approvedRevision = await request(app)
      .post(`/api/v1/salary-structure/revisions/${revision.body.data.id}/decision`)
      .set(...auth(approver))
      .set(...tenant(companyId))
      .send({ decision: 'APPROVED' });
    expect(approvedRevision.status).toBe(200);

    const appliedRevision = await request(app)
      .post(`/api/v1/salary-structure/revisions/${revision.body.data.id}/apply`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ idempotencyKey: 'salary-adjustment-001' });
    expect(appliedRevision.status).toBe(200);
    expect(appliedRevision.body.data.baseSalary).toBe('120000.00');
    const idempotentApply = await request(app)
      .post(`/api/v1/salary-structure/revisions/${revision.body.data.id}/apply`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ idempotencyKey: 'salary-adjustment-001' });
    expect(idempotentApply.status).toBe(200);
    expect(idempotentApply.body.data.id).toBe(appliedRevision.body.data.id);

    const batchDate = new Date(`${effectiveDate}T00:00:00.000Z`);
    batchDate.setUTCDate(batchDate.getUTCDate() + 1);
    const batchEffectiveDate = batchDate.toISOString().slice(0, 10);
    await contract?.update({ salaryAmount: '130000.00' });
    const batch = await request(app)
      .post('/api/v1/salary-structure/revision-batches')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        code: 'ANNUAL-2026',
        effectiveFrom: batchEffectiveDate,
        reason: 'Annual salary batch',
        idempotencyKey: 'salary-batch-001',
        items: [
          {
            employeeId,
            baseSalary: '130000.00',
            currency: 'AOA',
            structureVersionId,
            components: [],
          },
        ],
      });
    expect(batch.status).toBe(201);
    const validatedBatch = await request(app)
      .post(`/api/v1/salary-structure/revision-batches/${batch.body.data.id}/validate`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(validatedBatch.status).toBe(200);
    const approvedBatch = await request(app)
      .post(`/api/v1/salary-structure/revision-batches/${batch.body.data.id}/approve`)
      .set(...auth(approver))
      .set(...tenant(companyId));
    expect(approvedBatch.status).toBe(200);
    const appliedBatch = await request(app)
      .post(`/api/v1/salary-structure/revision-batches/${batch.body.data.id}/apply`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(appliedBatch.status).toBe(200);
    expect(appliedBatch.body.data.status).toBe('COMPLETED');
    expect(appliedBatch.body.data.items[0].status).toBe('APPLIED');
  });
});
