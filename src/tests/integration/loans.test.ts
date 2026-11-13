import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../../main/app';
import { AuditLogModel } from '../../modules/audit/infrastructure/persistence/model/audit-log.model';
import { EmploymentContractModel } from '../../modules/contracts/infrastructure/persistence/model/employment-contract.model';
import { EmployeeModel } from '../../modules/employees/infrastructure/persistence/model/employee.model';
import { CompanyMemberModel } from '../../modules/tenancy/infrastructure/persistence/model/company-member.model';
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

describe('Loans module', () => {
  let actor: TestActor;
  let approver: TestActor;
  let noPermission: TestActor;
  let companyId: number;
  let employeeId: string;

  beforeAll(async () => {
    await resetTestDatabase();
    actor = await createActor({ name: 'Loan applicant' });
    approver = await createActor({ name: 'Loan approver' });
    noPermission = await createActor({ name: 'Loan observer without permission' });

    const companyResponse = await request(app)
      .post('/api/v1/companies')
      .set(...auth(actor))
      .send({ name: 'Loans Tenant' });
    expect(companyResponse.status).toBe(201);
    companyId = companyResponse.body.data.id;

    const role = await RoleModel.create({
      name: 'Loans operator',
      description: 'Loans integration test',
      isSystem: false,
      companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const permissionNames = [
      'loans.applications.create',
      'loans.applications.read',
      'loans.applications.submit',
      'loans.applications.decide',
      'loans.loans.read',
      'loans.policies.read',
      'loans.policies.manage',
      'loans.disbursements.request',
      'loans.disbursements.confirm',
      'loans.repayments.register',
      'loans.repayments.reverse',
      'loans.deductions.request',
      'loans.deductions.confirm',
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
      userId: approver.userId,
      roleId: role.id,
      status: 'ACTIVE',
      invitedBy: actor.userId,
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const emptyRole = await RoleModel.create({
      name: 'Loans no-permission',
      description: null,
      isSystem: false,
      companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await CompanyMemberModel.create({
      companyId,
      userId: noPermission.userId,
      roleId: emptyRole.id,
      status: 'ACTIVE',
      invitedBy: actor.userId,
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    employeeId = randomUUID();
    const now = new Date();
    await EmployeeModel.create({
      id: employeeId,
      companyId,
      employeeNumber: 'LOAN-001',
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
      contractNumber: 'LOAN-C-001',
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

  it('enforces tenant permissions and tracks disbursement, repayment, reversal and payroll confirmation', async () => {
    const denied = await request(app)
      .get('/api/v1/loans')
      .set(...auth(noPermission))
      .set(...tenant(companyId));
    expect(denied.status).toBe(403);

    const policy = await request(app)
      .post('/api/v1/loans/policies')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        code: 'STANDARD',
        effectiveFrom: new Date().toISOString().slice(0, 10),
        maxAmount: '10000.00',
        maxInstallments: 24,
        maxActiveLoans: 2,
        allowedTypes: ['LOAN', 'SALARY_ADVANCE'],
        interestAllowed: false,
        maxAnnualInterestBps: 0,
        deductionAuthorizationRequired: true,
      });
    expect(policy.status).toBe(201);

    const application = await request(app)
      .post('/api/v1/loans/applications')
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        employeeId,
        loanType: 'LOAN',
        requestedAmount: '1000.00',
        currency: 'AOA',
        installmentCount: 4,
        frequency: 'MONTHLY',
        firstDueDate: '2026-12-31',
        reason: 'Household emergency',
      });
    expect(application.status).toBe(201);
    const applicationAudit = await AuditLogModel.findOne({
      where: { companyId, actorUserId: actor.userId, action: 'loans.application.created' },
    });
    expect(applicationAudit).not.toBeNull();

    const submitted = await request(app)
      .post(`/api/v1/loans/applications/${application.body.data.id}/submit`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(submitted.status).toBe(200);

    const selfApproval = await request(app)
      .post(`/api/v1/loans/applications/${application.body.data.id}/decision`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ decision: 'APPROVED' });
    expect(selfApproval.status).toBe(403);

    const approved = await request(app)
      .post(`/api/v1/loans/applications/${application.body.data.id}/decision`)
      .set(...auth(approver))
      .set(...tenant(companyId))
      .send({ decision: 'APPROVED' });
    expect(approved.status).toBe(200);

    const loans = await request(app)
      .get('/api/v1/loans')
      .set(...auth(actor))
      .set(...tenant(companyId));
    const loanId = loans.body.data[0].id as string;
    expect(loans.status).toBe(200);

    const disbursement = await request(app)
      .post(`/api/v1/loans/${loanId}/disbursements`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ idempotencyKey: 'loan-disbursement-1' });
    expect(disbursement.status).toBe(201);

    const confirmedDisbursement = await request(app)
      .post(`/api/v1/loans/${loanId}/disbursements/${disbursement.body.data.id}/confirm`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ paymentReference: 'BANK-LOAN-001' });
    expect(confirmedDisbursement.status).toBe(200);

    const repayment = await request(app)
      .post(`/api/v1/loans/${loanId}/repayments`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        amount: '1000.00',
        source: 'BANK_TRANSFER',
        externalReference: 'BANK-REPAYMENT-001',
        idempotencyKey: 'loan-repayment-1',
      });
    expect(repayment.status).toBe(201);
    expect(repayment.body.data.status).toBe('CONFIRMED');
    const conflictingPaymentRetry = await request(app)
      .post(`/api/v1/loans/${loanId}/repayments`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        amount: '900.00',
        source: 'BANK_TRANSFER',
        externalReference: 'BANK-REPAYMENT-OTHER',
        idempotencyKey: 'loan-repayment-1',
      });
    expect(conflictingPaymentRetry.status).toBe(409);

    const reversed = await request(app)
      .post(`/api/v1/loans/${loanId}/repayments/${repayment.body.data.id}/reverse`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ reversalReference: 'BANK-REVERSAL-001' });
    expect(reversed.status).toBe(200);
    expect(reversed.body.data.status).toBe('REVERSED');

    const deduction = await request(app)
      .post(`/api/v1/loans/${loanId}/deductions`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({ idempotencyKey: 'loan-deduction-1' });
    expect(deduction.status).toBe(201);

    const beforePayroll = await request(app)
      .get(`/api/v1/loans/${loanId}/balance`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(beforePayroll.body.data.total).toBe('1000.00');

    const confirmedDeduction = await request(app)
      .post(`/api/v1/loans/deductions/${deduction.body.data.id}/confirm`)
      .set(...auth(actor))
      .set(...tenant(companyId))
      .send({
        payrollRunId: 'PAYROLL-001',
        confirmedAmount: '100.00',
        idempotencyKey: 'payroll-confirmation-1',
      });
    expect(confirmedDeduction.status).toBe(200);

    const afterPayroll = await request(app)
      .get(`/api/v1/loans/${loanId}/balance`)
      .set(...auth(actor))
      .set(...tenant(companyId));
    expect(afterPayroll.body.data.total).toBe('900.00');

    const otherCompanyResponse = await request(app)
      .post('/api/v1/companies')
      .set(...auth(noPermission))
      .send({ name: 'Other loans tenant' });
    expect(otherCompanyResponse.status).toBe(201);
    const otherCompanyId = otherCompanyResponse.body.data.id as number;
    const otherTenantRole = await RoleModel.create({
      name: 'Other tenant loan reader',
      description: null,
      isSystem: false,
      companyId: otherCompanyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const readPermission = await PermissionModel.findOne({ where: { name: 'loans.loans.read' } });
    if (!readPermission) throw new Error('Loan read permission was not seeded.');
    await RolePermissionModel.create({
      roleId: otherTenantRole.id,
      permissionId: readPermission.id,
      createdAt: new Date(),
    });
    await CompanyMemberModel.update(
      { roleId: otherTenantRole.id },
      { where: { companyId: otherCompanyId, userId: noPermission.userId } },
    );

    const crossTenantRead = await request(app)
      .get(`/api/v1/loans/${loanId}`)
      .set(...auth(noPermission))
      .set(...tenant(otherCompanyId));
    expect(crossTenantRead.status).toBe(404);
  });
});
