import { z } from 'zod';
import {
  OnboardingPersistencePort,
  OnboardingApplicationView as Row,
  ProvisionCheckpoint,
  ProvisionStep,
  WorkflowPolicy,
} from '../ports/onboarding-store.port';
import { RecordStoreContext } from '../../../../shared/application/ports/record-store.port';
import { randomUUID } from 'crypto';

import { editable, fail, OnboardingPorts } from '../../domain/onboarding';
const executionLeaseMs = 600000;

type AdministrativeExecution = { actor: number; reason: string; action?: 'activate' | 'retry' };
export class OnboardingService {
  constructor(
    protected ports: OnboardingPorts,
    protected readonly persistence: OnboardingPersistencePort,
  ) {}
  protected async currentPolicy(transaction?: RecordStoreContext): Promise<WorkflowPolicy> {
    const policy = await this.persistence.policies.findOne({ order: [['version', 'DESC']], transaction });
    return policy ? { version: policy.version, ...policy.data } : {
      version: 1, requiredDocuments: Number(process.env.ONBOARDING_REQUIRED_DOCUMENTS || 0),
      invitationHours: 24, inactivityDays: 7,
    };
  }
  async selectPlan(id: string, actor: number, input: unknown, version: number) {
    const selection = z.object({ planVersionId: z.string() }).passthrough().parse(input);
    const plans = z.array(z.unknown()).parse(await this.ports.plans());
    const exists = plans.some((p: unknown) => {
      const plan = z
        .object({
          currentVersionId: z.string().nullish(),
          currentVersion: z.object({ id: z.string() }).nullish(),
        })
        .passthrough()
        .parse(p);
      return (
        plan.currentVersionId === selection.planVersionId ||
        plan.currentVersion?.id === selection.planVersionId
      );
    });
    if (!exists) throw fail('Seleccione uma versão publicada disponível.', 422);
    return this.save(id, actor, 'plan', input, version);
  }
  protected async event(
    row: Row,
    actor: number,
    type: string,
    tx: RecordStoreContext,
    details: Record<string, unknown> = {},
  ) {
    await this.persistence.events.create(
      {
        id: randomUUID(),
        applicationId: row.id,
        data: { actor, type, ...details, occurredAt: new Date().toISOString() },
      },
      { transaction: tx },
    );
  }
  protected async access(id: string, actor: number, admin: boolean, tx: RecordStoreContext) {
    const row = await this.persistence.applications.findOne({
      where: { id, ...(!admin ? { ownerId: actor } : {}) },
      transaction: tx,
      forUpdate: true,
    });
    if (!row) throw fail('Adesão não encontrada.', 404);
    return row;
  }
  private present(row: Row) {
    return row;
  }
  async start(actor: number, request: unknown, assisted = false) {
    const input = z
      .object({
        operationKey: z.string().min(8),
        mode: z.string().min(1),
        source: z.string().min(1),
        termsVersion: z.string().min(1),
        acceptedTerms: assisted ? z.literal(true).optional() : z.literal(true),
      })
      .passthrough()
      .parse(request);
    return this.persistence.applications.transaction(null, async (tx) => {
      const prior = await this.persistence.applications.findOne({
        where: { ownerId: actor, operationKey: input.operationKey },
        transaction: tx,
      });
      if (prior) {
        if (prior.data.request !== JSON.stringify(input))
          throw fail('Chave de idempotência reutilizada.', 409);
        return this.present(prior);
      }
      const policy = await this.currentPolicy(tx);
      const row = await this.persistence.applications.create(
        {
          id: randomUUID(),
          ownerId: actor,
          operationKey: input.operationKey,
          status: 'DRAFT',
          companyId: null,
          version: 1,
          data: {
            request: JSON.stringify(input),
            mode: input.mode,
            source: input.source,
            workflowVersion: policy.version,
            policy,
            ...(assisted ? { createdBy: actor, assigneeId: actor } : {
              termsVersion: input.termsVersion,
              termsAcceptedBy: actor,
              termsAcceptedAt: new Date().toISOString(),
            }),
            steps: {},
            executions: {},
          },
        },
        { transaction: tx },
      );
      await this.event(row, actor, 'onboarding.application.started', tx);
      return this.present(row);
    });
  }
  get(id: string, actor: number, admin = false) {
    return this.persistence.applications.transaction(null, async (tx) =>
      this.present(await this.access(id, actor, admin, tx)),
    );
  }
  list() {
    return this.persistence.applications.findAll({ order: [['createdAt', 'DESC']], limit: 100 });
  }
  history(id: string, actor: number, admin = false) {
    return this.persistence.applications.transaction(null, async (tx) => {
      await this.access(id, actor, admin, tx);
      const entries = await this.persistence.events.findAll({
        where: { applicationId: id },
        transaction: tx,
        order: [['createdAt', 'ASC']],
      });
      const internal = new Set(['onboarding.note.recorded', 'onboarding.assignment.changed', 'onboarding.reminder.requested']);
      if (admin) return entries;
      return entries.filter((entry) => !internal.has(entry.data.type)).map((entry) => {
        if (!['onboarding.provisioning.started', 'onboarding.invitation.revoked'].includes(entry.data.type)) return entry;
        const { reason: _internalReason, ...data } = entry.data;
        return { ...entry, data };
      });
    });
  }
  save(id: string, actor: number, step: string, input: unknown, version: number) {
    return this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, false, tx);
      if (!editable.includes(row.status) || row.companyId)
        throw fail('Adesão não permite edição.', 409);
      if (row.version !== version)
        throw fail('O processo foi alterado; actualize a consulta.', 409);
      await this.persistence.applications.update(
        row,
        {
          status: 'IN_PROGRESS',
          version: row.version + 1,
          data: {
            ...row.data,
            steps: { ...row.data.steps, [step]: input },
            approvedBy: null,
            ...(step === 'company' ? {
              companyVerification: null,
              companyRecheckRequired: row.data.companyRecheckRequired || row.data.companyVerification?.decision === 'NEEDS_CORRECTION',
            } : {}),
          },
        },
        { transaction: tx },
      );
      await this.event(row, actor, 'onboarding.application.updated', tx, { step });
      return this.present(row);
    });
  }
  async readiness(id: string, actor: number) {
    const row = await this.get(id, actor);
    return this.checkReadiness(row);
  }
  protected async checkReadiness(row: Row) {
    const steps = row.data.steps ?? {};
    const missing: string[] = [];
    if (row.data.createdBy && !row.data.assistedClaimedAt) missing.push('representative-accepted-invitation');
    if (!(await this.ports.verifiedUser(row.ownerId))) missing.push('verified-email');
    for (const s of ['company', 'plan', 'payroll-settings']) if (!steps[s]) missing.push(s);
    if (row.data.policy?.organizationRequiredModes?.includes(row.data.mode) &&
      !(steps.organization?.departments?.length || steps.organization?.costCenters?.length)) missing.push('organization');
    if (
      steps['payroll-settings'] &&
      !(await this.ports.validateLegal(steps['payroll-settings'].legalRuleSetId))
    )
      missing.push('published-legal-rules');
    if (!row.data.termsVersion || row.data.termsAcceptedBy !== row.ownerId) missing.push('terms');
    const required = Number(row.data.policy?.requiredDocuments ?? process.env.ONBOARDING_REQUIRED_DOCUMENTS ?? 0);
    if (!Number.isSafeInteger(required) || required < 0)
      throw fail('Política documental inválida.');
    if (
      required > 0 &&
      Number(
        await this.persistence.resources.count({
          where: { applicationId: row.id, kind: 'DOCUMENT', status: 'VALIDATED' },
        }),
      ) < required
    )
      missing.push('validated-documents');
    return { ready: missing.length === 0, missing, companyId: row.companyId };
  }
  protected companyReviewPending(row: Row) {
    const verification = row.data.companyVerification;
    const independentlyVerified = verification?.decision === 'VERIFIED' && verification.actor !== row.ownerId;
    return verification?.decision === 'NEEDS_CORRECTION' ||
      ((row.data.companyRecheckRequired === true ||
        row.data.policy?.companyVerificationModes?.includes(row.data.mode) === true) && !independentlyVerified);
  }

  async submit(id: string, actor: number) {
    const candidate = await this.get(id, actor);
    const readiness = await this.checkReadiness(candidate);
    if (!readiness.ready) throw fail(`Etapas em falta: ${readiness.missing.join(', ')}`);
    return this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, false, tx);
      if (!editable.includes(row.status)) throw fail('Estado inválido.', 409);
      if (row.version !== candidate.version) throw fail('A adesão foi alterada; actualize a consulta.', 409);
      await this.persistence.applications.update(
        row,
        { status: 'PENDING_REVIEW', version: row.version + 1 },
        { transaction: tx },
      );
      await this.event(row, actor, 'onboarding.application.submitted', tx);
      return this.present(row);
    });
  }
  async decision(id: string, actor: number, decision: string, reason: string, version?: number) {
    // Check dependencies outside the workflow transaction so a pending operation never holds a workflow lock.
    const candidate = decision === 'APPROVED' ? await this.get(id, actor, true) : null;
    const readiness = candidate ? await this.checkReadiness(candidate) : null;
    return this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, true, tx);
      if (row.status !== 'PENDING_REVIEW') throw fail('Adesão não aguarda revisão.', 409);
      if (row.ownerId === actor) throw fail('A aprovação exige outro utilizador.', 403);
      if (version !== undefined && row.version !== version) throw fail('A adesão foi alterada; actualize a consulta.', 409);
      if (candidate && readiness) {
        if (candidate.version !== row.version) throw fail('A adesão foi alterada; actualize a consulta.', 409);
        const missing = [...readiness.missing, ...(this.companyReviewPending(row) ? ['company-verification'] : [])];
        if (missing.length) throw fail(`Requisitos de aprovação em falta: ${missing.join(', ')}`, 409);
      }
      await this.persistence.applications.update(
        row,
        {
          status: decision,
          version: row.version + 1,
          data: {
            ...row.data,
            approvedBy: decision === 'APPROVED' ? actor : null,
            decisionReason: reason,
          },
        },
        { transaction: tx },
      );
      await this.event(row, actor, 'onboarding.application.decision', tx, { decision, reason });
      return this.present(row);
    });
  }
  cancel(id: string, actor: number) {
    return this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, false, tx);
      if (row.companyId || ['COMPLETED', 'PROVISIONING'].includes(row.status))
        throw fail('Processo provisionado; utilize a gestão da empresa.', 409);
      await this.persistence.applications.update(row, { status: 'CANCELLED' }, { transaction: tx });
      await this.event(row, actor, 'onboarding.application.cancelled', tx);
      return this.present(row);
    });
  }
  async provision(id: string, actor: number, administration?: AdministrativeExecution) {
    const candidate = await this.get(id, actor);
    if (candidate.status === 'COMPLETED' && administration?.action !== 'retry') return candidate;
    const readiness = await this.checkReadiness(candidate);
    const executionId = randomUUID();
    const performedBy = administration?.actor ?? actor;
    const snapshot = await this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, false, tx);
      if (row.status === 'COMPLETED' && administration?.action !== 'retry') return row;
      const recoverable =
        row.status === 'PROVISIONING' && Number(row.data.leaseUntil || 0) < Date.now();
      if (administration && administration.action !== 'activate' && row.status !== 'FAILED' && !recoverable)
        throw fail('A tarefa não está disponível para recuperação.', 409);
      if (administration?.action === 'activate' && !['APPROVED', 'AWAITING_PAYMENT'].includes(row.status))
        throw fail('A adesão não está disponível para activação.', 409);
      if (!recoverable && !['APPROVED', 'FAILED', 'AWAITING_PAYMENT'].includes(row.status))
        throw fail('Processo não aprovado ou já em execução.', 409);
      if (row.version !== candidate.version) throw fail('A adesão foi alterada; actualize a consulta.', 409);
      const missing = [...readiness.missing];
      if (this.companyReviewPending(row)) missing.push('company-verification');
      if (!row.data.approvedBy || row.data.approvedBy === row.ownerId) missing.push('independent-approval');
      if (missing.length) throw fail(`Requisitos de activação em falta: ${missing.join(', ')}`, 409);
      await this.persistence.applications.update(
        row,
        { status: 'PROVISIONING', data: { ...row.data, executionId, leaseUntil: Date.now() + executionLeaseMs } },
        { transaction: tx },
      );
      await this.event(row, performedBy, 'onboarding.provisioning.started', tx,
        administration ? { reason: administration.reason } : {});
      return row;
    });
    if (snapshot.status === 'COMPLETED') return snapshot;
    let activeStep: ProvisionStep = 'tenant';
    const execution = async (tx: RecordStoreContext) => {
      const row = await this.access(id, actor, false, tx);
      if (row.status !== 'PROVISIONING' || row.data.executionId !== executionId)
        throw fail('Esta execução já foi substituída.', 409);
      return row;
    };
    const run = async (step: ProvisionStep, operation: () => Promise<void | number>) => {
      activeStep = step;
      const checkpoint = await this.persistence.applications.transaction(null, async (tx) => {
        const row = await execution(tx);
        const previous = row.data.executions?.[step] as ProvisionCheckpoint | undefined;
        if (previous?.status === 'COMPLETED') return null;
        const running: ProvisionCheckpoint = {
          status: 'RUNNING', attempts: (previous?.attempts ?? 0) + 1, updatedAt: new Date().toISOString(),
        };
        await this.persistence.applications.update(row, { data: {
          ...row.data, leaseUntil: Date.now() + executionLeaseMs,
          executions: { ...row.data.executions, [step]: running },
        } }, { transaction: tx });
        return running;
      });
      if (!checkpoint) return;
      const result = await operation();
      await this.persistence.applications.transaction(null, async (tx) => {
        const row = await execution(tx);
        const newCompanyId = typeof result === 'number' ? result : undefined;
        const completed: ProvisionCheckpoint = { ...checkpoint, status: 'COMPLETED', updatedAt: new Date().toISOString() };
        await this.persistence.applications.update(row, {
          ...(step === 'tenant' && newCompanyId !== undefined ? { companyId: newCompanyId } : {}),
          data: { ...row.data, executions: { ...row.data.executions, [step]: completed } },
        }, { transaction: tx });
        await this.event(row, performedBy, 'onboarding.provisioning.step-completed', tx, {
          step, ...(step === 'tenant' ? { companyId: row.companyId } : {}),
        });
        if (step === 'tenant' && snapshot.companyId === null)
          await this.event(row, performedBy, 'onboarding.provisioning.tenant-created', tx, { companyId: row.companyId });
      });
    };
    try {
      const { steps } = snapshot.data;
      let companyId = snapshot.companyId;
      await run('tenant', async () => {
        companyId ??= await this.ports.provision({
          applicationId: id,
          actor,
          company: steps.company,
          settings: { organization: steps.organization || {}, payroll: steps['payroll-settings'] },
        });
        return companyId;
      });
      const tenant = companyId;
      if (tenant === null) throw fail('Identificador da empresa indisponível.', 409);
      await run('organization', () => this.ports.configureOrganization(tenant, actor, steps.organization || {}));
      await run('payroll-settings', () => this.ports.configurePayroll(tenant, actor, steps['payroll-settings']));
      await run('billing-account', async () => { await this.ports.billingAccount(tenant, actor, steps.company); });
      await run('subscription', async () => { await this.ports.subscribe(tenant, actor, steps.plan, `onboarding:${id}`); });
      const finalised = snapshot.data.executions?.activation?.status === 'COMPLETED';
      const sub = finalised ? null : await this.ports.subscription(tenant);
      const allowed = finalised || (sub && ['ACTIVE', 'TRIALING'].includes(sub.status));
      if (allowed) await run('activation', () => this.ports.activate(tenant, id));
      return this.persistence.applications.transaction(null, async (tx) => {
        const row = await execution(tx);
        await this.persistence.applications.update(
          row,
          { status: allowed ? 'COMPLETED' : 'AWAITING_PAYMENT',
            data: { ...row.data, lastError: null, leaseUntil: null, executionId: null,
              ...(allowed ? { completedAt: new Date().toISOString() } : {}) } },
          { transaction: tx },
        );
        await this.event(
          row,
          performedBy,
          allowed ? 'onboarding.application.completed' : 'onboarding.payment.required',
          tx,
        );
        return this.present(row);
      });
    } catch (error) {
      await this.persistence.applications.transaction(null, async (tx) => {
        const row = await this.access(id, actor, false, tx);
        if (row.status !== 'PROVISIONING' || row.data.executionId !== executionId) return;
        const checkpoint = row.data.executions?.[activeStep] as ProvisionCheckpoint | undefined;
        const executions = checkpoint?.status === 'RUNNING' ? {
          ...row.data.executions, [activeStep]: { ...checkpoint, status: 'FAILED', updatedAt: new Date().toISOString() },
        } : row.data.executions;
        await this.persistence.applications.update(
          row,
          { status: 'FAILED', data: { ...row.data, executions, lastError: null, leaseUntil: null, executionId: null } },
          { transaction: tx },
        );
        await this.event(row, performedBy, 'onboarding.provisioning.failed', tx, { step: activeStep });
      });
      throw error;
    }
  }
  plans() {
    return this.ports.plans();
  }
  async billingStatus(id: string, actor: number) {
    const row = await this.get(id, actor);
    return row.companyId ? this.ports.subscription(row.companyId) : null;
  }
}

