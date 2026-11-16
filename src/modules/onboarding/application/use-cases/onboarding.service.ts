import { z } from 'zod';
import {
  OnboardingPersistencePort,
  OnboardingApplicationView as Row,
} from '../ports/onboarding-store.port';
import { RecordStoreContext } from '../../../../shared/application/ports/record-store.port';
import { randomUUID } from 'crypto';

import { editable, fail, OnboardingPorts } from '../../domain/onboarding';
export class OnboardingService {
  constructor(
    protected ports: OnboardingPorts,
    protected readonly persistence: OnboardingPersistencePort,
  ) {}
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
  private async event(
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
  async start(actor: number, request: unknown) {
    const input = z
      .object({
        operationKey: z.string().min(8),
        mode: z.string().min(1),
        source: z.string().min(1),
        termsVersion: z.string().min(1),
        acceptedTerms: z.literal(true),
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
            workflowVersion: 1,
            termsVersion: input.termsVersion,
            termsAcceptedBy: actor,
            termsAcceptedAt: new Date().toISOString(),
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
      return this.persistence.events.findAll({
        where: { applicationId: id },
        transaction: tx,
        order: [['createdAt', 'ASC']],
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
          data: { ...row.data, steps: { ...row.data.steps, [step]: input }, approvedBy: null },
        },
        { transaction: tx },
      );
      await this.event(row, actor, 'onboarding.application.updated', tx, { step });
      return this.present(row);
    });
  }
  async readiness(id: string, actor: number) {
    const row = await this.get(id, actor);
    const { steps } = row.data,
      missing = [];
    if (!(await this.ports.verifiedUser(actor))) missing.push('verified-email');
    for (const s of ['company', 'plan', 'payroll-settings']) if (!steps[s]) missing.push(s);
    if (
      steps['payroll-settings'] &&
      !(await this.ports.validateLegal(steps['payroll-settings'].legalRuleSetId))
    )
      missing.push('published-legal-rules');
    if (!row.data.termsVersion || row.data.termsAcceptedBy !== actor) missing.push('terms');
    const required = Number(process.env.ONBOARDING_REQUIRED_DOCUMENTS || 0);
    if (!Number.isSafeInteger(required) || required < 0)
      throw fail('Política documental inválida.');
    if (
      required > 0 &&
      Number(
        await this.persistence.resources.count({
          where: { applicationId: id, kind: 'DOCUMENT', status: 'VALIDATED' },
        }),
      ) < required
    )
      missing.push('validated-documents');
    return { ready: missing.length === 0, missing, companyId: row.companyId };
  }
  async submit(id: string, actor: number) {
    const readiness = await this.readiness(id, actor);
    if (!readiness.ready) throw fail(`Etapas em falta: ${readiness.missing.join(', ')}`);
    return this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, false, tx);
      if (!editable.includes(row.status)) throw fail('Estado inválido.', 409);
      await this.persistence.applications.update(
        row,
        { status: 'PENDING_REVIEW' },
        { transaction: tx },
      );
      await this.event(row, actor, 'onboarding.application.submitted', tx);
      return this.present(row);
    });
  }
  decision(id: string, actor: number, decision: string, reason: string) {
    return this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, true, tx);
      if (row.status !== 'PENDING_REVIEW') throw fail('Adesão não aguarda revisão.', 409);
      if (row.ownerId === actor) throw fail('A aprovação exige outro utilizador.', 403);
      await this.persistence.applications.update(
        row,
        {
          status: decision,
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
  async provision(id: string, actor: number) {
    const readiness = await this.readiness(id, actor);
    if (!readiness.ready)
      throw fail(`Requisitos de activação em falta: ${readiness.missing.join(', ')}`);
    const snapshot = await this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, false, tx);
      if (row.status === 'COMPLETED') return this.present(row);
      const recoverable =
        row.status === 'PROVISIONING' && Number(row.data.leaseUntil || 0) < Date.now();
      if (!recoverable && !['APPROVED', 'FAILED', 'AWAITING_PAYMENT'].includes(row.status))
        throw fail('Processo não aprovado ou já em execução.', 409);
      await this.persistence.applications.update(
        row,
        { status: 'PROVISIONING', data: { ...row.data, leaseUntil: Date.now() + 600000 } },
        { transaction: tx },
      );
      await this.event(row, actor, 'onboarding.provisioning.started', tx);
      return this.present(row);
    });
    if (snapshot.status === 'COMPLETED') return snapshot;
    try {
      const { steps } = snapshot.data;
      const companyId =
        snapshot.companyId ||
        (await this.ports.provision({
          applicationId: id,
          actor,
          company: steps.company,
          settings: { organization: steps.organization || {}, payroll: steps['payroll-settings'] },
        }));
      await this.persistence.applications.transaction(null, async (tx) => {
        const row = await this.access(id, actor, false, tx);
        await this.persistence.applications.update(row, { companyId }, { transaction: tx });
        await this.event(row, actor, 'onboarding.provisioning.tenant-created', tx, { companyId });
      });
      await this.ports.configureOrganization(companyId, actor, steps.organization || {});
      await this.ports.configurePayroll(companyId, actor, steps['payroll-settings']);
      await this.ports.billingAccount(companyId, actor, steps.company);
      await this.ports.subscribe(companyId, actor, steps.plan, `onboarding:${id}`);
      const sub = await this.ports.subscription(companyId);
      const allowed = sub && ['ACTIVE', 'TRIALING'].includes(sub.status);
      if (allowed) await this.ports.activate(companyId, id);
      return this.persistence.applications.transaction(null, async (tx) => {
        const row = await this.access(id, actor, false, tx);
        await this.persistence.applications.update(
          row,
          { status: allowed ? 'COMPLETED' : 'AWAITING_PAYMENT' },
          { transaction: tx },
        );
        await this.event(
          row,
          actor,
          allowed ? 'onboarding.application.completed' : 'onboarding.payment.required',
          tx,
        );
        return this.present(row);
      });
    } catch (error) {
      await this.persistence.applications.transaction(null, async (tx) => {
        const row = await this.access(id, actor, false, tx);
        await this.persistence.applications.update(
          row,
          { status: 'FAILED', data: { ...row.data, lastError: String(error) } },
          { transaction: tx },
        );
        await this.event(row, actor, 'onboarding.provisioning.failed', tx);
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
