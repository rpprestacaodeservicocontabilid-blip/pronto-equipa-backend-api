import { SequelizeOnboardingStore } from '../infrastructure/persistence/repositories/sequelize-onboarding-store';
jest.mock('../../../infra/database', () => {
  const { Sequelize } = require('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});
import { sequelize } from '../../../infra/database';
import { OnboardingService } from './use-cases/onboarding.service';
import {
  OnboardingApplication,
  OnboardingEvent,
} from '../infrastructure/persistence/models/onboarding.model';
import { OnboardingPorts } from '../domain/onboarding';
describe('Onboarding ownership and recovery', () => {
  let service: OnboardingService;
  let ports: OnboardingPorts;
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });
  afterAll(async () => {
    await sequelize.close();
  });
  beforeEach(async () => {
    await OnboardingEvent.destroy({ where: {} });
    await OnboardingApplication.destroy({ where: {} });
    ports = {
      verifiedUser: jest.fn().mockResolvedValue(true),
      provision: jest.fn().mockResolvedValue(10),
      activate: jest.fn().mockResolvedValue(undefined),
      plans: jest.fn().mockResolvedValue([]),
      subscribe: jest.fn().mockResolvedValue({ id: 'sub' }),
      subscription: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      billingAccount: jest.fn().mockResolvedValue({}),
      validateLegal: jest.fn().mockResolvedValue(true),
      configureOrganization: jest.fn().mockResolvedValue(undefined),
      configurePayroll: jest.fn().mockResolvedValue(undefined),
    };
    service = new OnboardingService(ports, new SequelizeOnboardingStore());
  });
  async function draft() {
    return service.start(1, {
      operationKey: 'request-123456',
      mode: 'SELF_SERVICE',
      source: 'WEB',
      termsVersion: 'v1',
      acceptedTerms: true,
    });
  }
  async function approved() {
    let row = await draft();
    for (const [step, data] of Object.entries({
      company: { name: 'Empresa' },
      plan: { planVersionId: 'plan' },
      'payroll-settings': { legalRuleSetId: 'legal' },
    }))
      row = await service.save(row.id, 1, step, data, row.version);
    await service.submit(row.id, 1);
    await service.decision(row.id, 9, 'APPROVED', 'Validado');
    return row.id;
  }
  it('deduplicates start and rejects conflicting reuse', async () => {
    const first = await draft();
    expect((await draft()).id).toBe(first.id);
    await expect(
      service.start(1, { operationKey: 'request-123456', mode: 'ENTERPRISE' }),
    ).rejects.toThrow();
  });
  it('refuses access to another owner and stale progress updates', async () => {
    const row = await draft();
    await expect(service.get(row.id, 2)).rejects.toThrow();
    await service.save(row.id, 1, 'company', { name: 'Empresa' }, 1);
    await expect(service.save(row.id, 1, 'company', { name: 'Outro' }, 1)).rejects.toThrow();
  });
  it('blocks submission without verified email and required steps', async () => {
    const row = await draft();
    (ports.verifiedUser as jest.Mock).mockResolvedValue(false);
    expect((await service.readiness(row.id, 1)).missing).toContain('verified-email');
    await expect(service.submit(row.id, 1)).rejects.toThrow();
  });
  it('requires independent approval', async () => {
    let row = await draft();
    for (const step of ['company', 'plan', 'payroll-settings'])
      row = await service.save(row.id, 1, step, { legalRuleSetId: 'legal' }, row.version);
    await service.submit(row.id, 1);
    await expect(service.decision(row.id, 1, 'APPROVED', 'Own approval')).rejects.toThrow();
  });
  it('does not activate a tenant while the subscription awaits payment', async () => {
    const id = await approved();
    (ports.subscription as jest.Mock).mockResolvedValue({ status: 'PENDING_PAYMENT' });
    expect((await service.provision(id, 1)).status).toBe('AWAITING_PAYMENT');
    expect(ports.activate).not.toHaveBeenCalled();
  });
  it('recovers after a partial failure without provisioning another tenant', async () => {
    const id = await approved();
    (ports.subscribe as jest.Mock).mockRejectedValueOnce(new Error('temporary'));
    await expect(service.provision(id, 1)).rejects.toThrow('temporary');
    expect((await service.get(id, 1)).companyId).toBe(10);
    expect((await service.provision(id, 1)).status).toBe('COMPLETED');
    expect(ports.provision).toHaveBeenCalledTimes(1);
    expect(ports.activate).toHaveBeenCalledTimes(1);
  });
});
