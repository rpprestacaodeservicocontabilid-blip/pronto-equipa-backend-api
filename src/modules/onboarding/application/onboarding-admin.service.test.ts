import { SequelizeOnboardingStore } from '../infrastructure/persistence/repositories/sequelize-onboarding-store';
import { sequelize } from '../../../infra/database';
import { OnboardingAdminService } from './use-cases/onboarding-admin.service';
import { OnboardingResourcePorts } from './use-cases/onboarding-resources.service';
import { OnboardingPorts } from '../domain/onboarding';

jest.mock('../../../infra/database', () => {
  const { Sequelize } = require('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});

describe('Administrative onboarding workflow', () => {
  let service: OnboardingAdminService;
  let ports: OnboardingPorts;

  beforeEach(async () => {
    await sequelize.sync({ force: true });
    ports = {
      verifiedUser: jest.fn().mockResolvedValue(true),
      provision: jest.fn().mockResolvedValue(10),
      activate: jest.fn().mockResolvedValue(undefined),
      plans: jest.fn().mockResolvedValue([{ currentVersionId: 'plan' }]),
      subscribe: jest.fn().mockResolvedValue({ id: 'sub' }),
      subscription: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      billingAccount: jest.fn().mockResolvedValue({}),
      validateLegal: jest.fn().mockResolvedValue(true),
      configureOrganization: jest.fn().mockResolvedValue(undefined),
      configurePayroll: jest.fn().mockResolvedValue(undefined),
    };
    const resources = {
      inviteAddress: (actor: number) => Promise.resolve('rep-' + actor + '@example.test'),
      assigneeAvailable: (actor: number) => Promise.resolve(actor === 9),
      companyTaxRegistry: () => Promise.resolve([{ id: 2, name: 'Registered company', taxId: '123-456' }]),
    } as OnboardingResourcePorts;
    service = new OnboardingAdminService(ports, resources, new SequelizeOnboardingStore());
  });
  afterAll(() => sequelize.close());

  const company = { name: 'Example company', taxId: '123456', email: 'rep-1@example.test', address: 'Luanda' };
  async function assisted() {
    return service.createAssisted(9, { operationKey: 'application-1', mode: 'ADMIN_ASSISTED', source: 'Sales', company });
  }

  it('binds invitations to the representative and keeps administrative notes private', async () => {
    const { id } = await assisted();
    await expect(service.consent(id, 9, '1')).rejects.toMatchObject({ statusCode: 409 });
    const stale = await service.invitation(id, 9, 'rep-1@example.test');
    const invitation = await service.invitation(id, 9, 'rep-1@example.test');
    await expect(service.accept(1, stale.token)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.accept(2, invitation.token)).rejects.toMatchObject({ statusCode: 403 });
    await service.accept(1, invitation.token);
    await service.note(id, 9, 'Confidential case note');
    expect((await service.get(id, 1)).data.termsAcceptedBy).toBeNull();
    expect(await service.history(id, 1)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ data: expect.objectContaining({ reason: 'Confidential case note' }) }),
    ]));
    expect((await service.workspace(id, 9)).events).toEqual(expect.arrayContaining([
      expect.objectContaining({ actor: 9, reason: 'Confidential case note' }),
    ]));
  });

  it('preserves application policy versions and includes registered companies in the duplicate queue', async () => {
    const { id } = await assisted();
    const current = (await service.policy()).current;
    await service.publishPolicy(9, current.version, { invitationHours: 4, inactivityDays: 10, requiredDocuments: 2 }, 'Updated checks');
    await expect(service.publishPolicy(9, current.version, { invitationHours: 3, inactivityDays: 11, requiredDocuments: 3 }, 'Stale update'))
      .rejects.toMatchObject({ statusCode: 409 });
    expect((await service.invitation(id, 9, company.email)).expiresInSeconds).toBe(24 * 3600);
    const revised = await service.createAssisted(9, { operationKey: 'application-2', mode: 'ADMIN_ASSISTED', source: 'Sales' });
    expect((await service.invitation(revised.id, 9, company.email)).expiresInSeconds).toBe(4 * 3600);
    expect((await service.directory({ flag: 'duplicates', page: 1, limit: 20 })).items.map(row => row.id)).toEqual([id]);
  });

  it('requires the configured organisation setup and independently verified company details before approval', async () => {
    const { current } = await service.policy();
    await service.publishPolicy(9, current.version, {
      requiredDocuments: 0, invitationHours: 24, inactivityDays: 7,
      companyVerificationModes: ['SELF_SERVICE'], organizationRequiredModes: ['SELF_SERVICE'],
    }, 'Updated approval checks');
    let row = await service.start(1, { operationKey: 'policy-self-service', mode: 'SELF_SERVICE', source: 'WEB', termsVersion: '1', acceptedTerms: true });
    for (const [name, input] of Object.entries({ company, plan: { planVersionId: 'plan' }, 'payroll-settings': { legalRuleSetId: 'legal' } }))
      row = await service.save(row.id, 1, name, input, row.version);
    await expect(service.submit(row.id, 1)).rejects.toThrow('organization');
    await service.save(row.id, 1, 'organization', { departments: ['Operations'] }, row.version);
    const submitted = await service.submit(row.id, 1);
    await expect(service.decision(row.id, 9, 'APPROVED', 'Reviewed', submitted.version)).rejects.toThrow('company-verification');
    await expect(service.verifyCompany(row.id, 1, true, 'Self review', submitted.version)).rejects.toMatchObject({ statusCode: 403 });
    await service.verifyCompany(row.id, 9, true, 'Checked company details', submitted.version);
    await expect(service.decision(row.id, 9, 'APPROVED', 'Stale review', submitted.version)).rejects.toMatchObject({ statusCode: 409 });
    expect((await service.workspace(row.id, 9)).approvalBlockers).toEqual([]);
    await service.decision(row.id, 9, 'APPROVED', 'Reviewed', submitted.version + 1);
  });

  it('revokes only the specified application’s invitation and records one administrative event', async () => {
    const { id } = await assisted();
    const other = await service.createAssisted(9, { operationKey: 'second-assisted', mode: 'ADMIN_ASSISTED', source: 'Sales' });
    const { token } = await service.invitation(id, 9, company.email);
    const [invitation] = (await service.workspace(id, 9)).resources;
    await expect(service.revokeInvitation(other.id, 9, invitation.id, 'Wrong case')).rejects.toMatchObject({ statusCode: 404 });
    await service.revokeInvitation(id, 9, invitation.id, 'Representative changed');
    await service.revokeInvitation(id, 9, invitation.id, 'Retried request');
    await expect(service.accept(1, token)).rejects.toMatchObject({ statusCode: 403 });
    expect((await service.workspace(id, 9)).resources[0].status).toBe('REVOKED');
    const events = (await service.audit(1, 20, id, true)).items.filter(row => row.type === 'onboarding.invitation.revoked');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor: 9, reason: 'Representative changed' });
  });

  it('uses commercial confirmation to resume admin activation without repeating setup', async () => {
    let row = await service.start(1, { operationKey: 'activate-assisted', mode: 'SELF_SERVICE', source: 'WEB', termsVersion: '1', acceptedTerms: true });
    for (const [name, input] of Object.entries({ company, plan: { planVersionId: 'plan' }, 'payroll-settings': { legalRuleSetId: 'legal' } }))
      row = await service.save(row.id, 1, name, input, row.version);
    await service.submit(row.id, 1);
    await expect(service.activateFromAdmin(row.id, 9, 'Initial request')).rejects.toMatchObject({ statusCode: 409 });
    await service.decision(row.id, 9, 'APPROVED', 'Reviewed');
    (ports.subscription as jest.Mock).mockResolvedValue({ status: 'PENDING_PAYMENT' });
    expect(await service.activateFromAdmin(row.id, 9, 'Start setup')).toEqual({ status: 'AWAITING_PAYMENT' });
    await expect(service.activateFromAdmin(row.id, 9, 'Premature request')).rejects.toMatchObject({ statusCode: 409 });
    expect(ports.activate).not.toHaveBeenCalled();
    (ports.subscription as jest.Mock).mockResolvedValue({ status: 'ACTIVE' });
    expect(await service.activateFromAdmin(row.id, 9, 'Commercial state confirmed')).toEqual({ status: 'COMPLETED' });
    expect(ports.subscribe).toHaveBeenCalledTimes(1);
    expect(ports.activate).toHaveBeenCalledTimes(1);
    expect((await service.workspace(row.id, 9)).events).toEqual(expect.arrayContaining([
      expect.objectContaining({ actor: 9, type: 'onboarding.provisioning.started', reason: 'Commercial state confirmed' }),
    ]));
  });

  it('records administrative recovery with the administrator while provisioning under the applicant', async () => {
    let row = await service.start(1, { operationKey: 'self-service', mode: 'SELF_SERVICE', source: 'WEB', termsVersion: '1', acceptedTerms: true });
    for (const [name, input] of Object.entries({ company, plan: { planVersionId: 'plan' }, 'payroll-settings': { legalRuleSetId: 'legal' } })) {
      row = await service.save(row.id, 1, name, input, row.version);
    }
    await service.submit(row.id, 1);
    await service.decision(row.id, 9, 'APPROVED', 'Reviewed');
    await expect(service.retry(row.id, 9, 'Unexpected retry')).rejects.toMatchObject({ statusCode: 409 });
    (ports.subscribe as jest.Mock).mockRejectedValueOnce(new Error('Temporary failure'));
    await expect(service.provision(row.id, 1)).rejects.toThrow('Temporary failure');
    expect((await service.retry(row.id, 9, 'Retried after service recovery')).status).toBe('COMPLETED');
    expect(ports.provision).toHaveBeenCalledTimes(1);
    expect(ports.subscribe).toHaveBeenLastCalledWith(10, 1, { planVersionId: 'plan' }, 'onboarding:' + row.id);
    expect((await service.workspace(row.id, 9)).events).toEqual(expect.arrayContaining([
      expect.objectContaining({ actor: 9, type: 'onboarding.provisioning.started', reason: 'Retried after service recovery' }),
    ]));
  });
});
