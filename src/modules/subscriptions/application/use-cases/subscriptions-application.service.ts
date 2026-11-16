import {
  SubscriptionPersistencePort,
  SubscriptionRecord,
} from '../ports/subscription-persistence.port';
import {
  RecordStorePort,
  RecordStoreContext,
  RecordFilter as Op,
} from '../../../../shared/application/ports/record-store.port';
import { randomUUID } from 'crypto';

import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';

import {
  BillingInterval,
  EntitlementDecision,
  SubscriptionLimit,
  SUBSCRIPTION_METRICS,
} from '../../domain/subscription.types';

const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const json = (row: SubscriptionRecord) => row;
const money = (value: string | number) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !/^\d{1,12}(\.\d{1,2})?$/.test(String(value)))
    throw fail('Preço inválido: use valor não negativo com até duas casas decimais.');
  return n.toFixed(2);
};
const addInterval = (date: Date, interval: BillingInterval, customDays?: number) => {
  const d = new Date(date);
  if (interval === 'MONTHLY') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (interval === 'QUARTERLY') d.setUTCMonth(d.getUTCMonth() + 3);
  else if (interval === 'SEMIANNUAL') d.setUTCMonth(d.getUTCMonth() + 6);
  else if (interval === 'ANNUAL') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCDate(d.getUTCDate() + (customDays || 30));
  return d;
};
const periodKey = (date = new Date()) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const featureCode = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-');
type PlanInput = {
  code: string;
  name: string;
  description?: string;
  type: string;
  prices: Array<{
    currency: string;
    interval: BillingInterval;
    amount: string;
    customDays?: number;
  }>;
  features: Record<string, boolean | string | number>;
  limits: Record<string, { value: string | null; policy: 'HARD' | 'SOFT' | 'OVERAGE' }>;
};
export class SubscriptionsApplicationService {
  async billingContract(companyId: number) {
    const sub = await this.current(companyId);
    if (!sub) return null;
    if (sub.pendingPlanVersionId) {
      const interval = sub.pendingInterval || sub.interval;
      const prices = await this.persistence.collections.subscriptionPlanPrice.findAll({
        where: { companyId: null, runId: sub.pendingPlanVersionId, status: 'ACTIVE' },
      });
      const price = prices.find(
        (p) => p.data.interval === interval && p.data.currency === sub.price?.currency,
      );
      if (!price) throw fail('Preço do plano pendente indisponível.', 422);
      return { ...sub, price: price.data, interval };
    }
    return sub;
  }
  constructor(
    private readonly audit: AuditRecorderPort,
    private readonly persistence: SubscriptionPersistencePort,
  ) {}
  private tenant<T>(companyId: number, fn: (tx: RecordStoreContext) => Promise<T>): Promise<T> {
    return this.persistence.collections.tenantSubscription.transaction(companyId, fn);
  }
  private platform<T>(fn: (tx: RecordStoreContext) => Promise<T>): Promise<T> {
    return this.persistence.collections.subscriptionPlan.transaction(null, fn);
  }
  private async create(
    companyId: number | null,
    model: RecordStorePort<SubscriptionRecord>,
    input: Partial<SubscriptionRecord> & {
      id: string;
      status: string;
      key: string;
      data: Record<string, any>;
    },
    tx: RecordStoreContext,
  ) {
    const now = new Date();
    return model.create(
      {
        companyId,
        runId: null,
        employeeId: null,
        version: 1,
        ...input,
        createdAt: now,
        updatedAt: now,
      },
      { transaction: tx },
    );
  }
  private async one(
    companyId: number,
    model: RecordStorePort<SubscriptionRecord>,
    id: string,
    tx?: RecordStoreContext,
  ) {
    const row = await model.findOne({
      where: { companyId, id },
      ...(tx ? { transaction: tx } : {}),
    });
    if (!row) throw fail('Registo não encontrado.', 404);
    return row;
  }
  private present(row: SubscriptionRecord): any {
    const r = json(row);
    return {
      id: r.id,
      companyId: r.companyId,
      status: r.status,
      ...r.data,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
  private async emit(
    companyId: number | null,
    event: string,
    entityId: string,
    data: Record<string, any>,
    tx: RecordStoreContext,
  ) {
    await this.create(
      companyId,
      this.persistence.collections.subscriptionOutbox,
      {
        id: randomUUID(),
        status: 'PENDING',
        key: `${event}:${entityId}:${randomUUID()}`,
        data: { event, entityId, ...data, occurredAt: new Date().toISOString(), attempts: 0 },
      },
      tx,
    );
  }
  async listPlans(publishedOnly = true) {
    const rows = await this.persistence.collections.subscriptionPlan.findAll({
      where: { companyId: null, ...(publishedOnly ? { status: 'PUBLISHED' } : {}) },
      order: [['createdAt', 'DESC']],
    });
    return Promise.all(rows.map(async (row) => this.planView(row)));
  }
  async plan(id: string): Promise<any> {
    const row = await this.persistence.collections.subscriptionPlan.findOne({
      where: { companyId: null, id },
    });
    if (!row) throw fail('Plano não encontrado.', 404);
    return this.planView(row);
  }
  private async planView(row: SubscriptionRecord): Promise<any> {
    const versionId = row.data.currentVersionId;
    const version = versionId
      ? await this.persistence.collections.subscriptionPlanVersion.findOne({
          where: { companyId: null, id: versionId },
        })
      : null;
    const versions = await this.persistence.collections.subscriptionPlanVersion.findAll({
      where: { companyId: null, runId: row.id },
      order: [['version', 'DESC']],
    });
    return {
      ...this.present(row),
      currentVersion: version ? this.present(version) : null,
      versions: versions.map((v: any) => this.present(v)),
    };
  }
  async createPlan(actor: number, input: PlanInput) {
    this.validatePlan(input);
    const id = randomUUID(),
      data = { ...input, code: input.code.toUpperCase(), createdBy: actor };
    const row = await this.platform(async (tx) => {
      const existing = await this.persistence.collections.subscriptionPlan.findOne({
        where: { companyId: null, key: `plan:${data.code}` },
        transaction: tx,
      });
      if (existing) throw fail('O código do plano já existe.', 409);
      return this.create(
        null,
        this.persistence.collections.subscriptionPlan,
        { id, status: 'DRAFT', key: `plan:${data.code}`, data },
        tx,
      );
    });
    await this.audit.record({
      companyId: null,
      actorUserId: actor,
      action: 'SUBSCRIPTION_PLAN_CREATED',
      entityType: 'SUBSCRIPTION_PLAN',
      entityId: id,
      after: { code: data.code, type: data.type },
    });
    await this.emitPlatform('subscriptions.plan.created', id, { code: data.code });
    return this.present(row);
  }
  async updatePlan(actor: number, id: string, input: Partial<PlanInput>) {
    const row = await this.platform(async (tx) => {
      const p = await this.persistence.collections.subscriptionPlan.findOne({
        where: { companyId: null, id },
        transaction: tx,
        forUpdate: true,
      });
      if (!p) throw fail('Plano não encontrado.', 404);
      if (p.status !== 'DRAFT')
        throw fail('Planos publicados são imutáveis; crie uma nova versão.', 409);
      const data = { ...p.data, ...input, updatedBy: actor };
      this.validatePlan(data as PlanInput);
      await this.persistence.update(p, { data, updatedAt: new Date() }, { transaction: tx });
      return p;
    });
    await this.audit.record({
      companyId: null,
      actorUserId: actor,
      action: 'SUBSCRIPTION_PLAN_UPDATED',
      entityType: 'SUBSCRIPTION_PLAN',
      entityId: id,
      after: input as any,
    });
    return this.present(row);
  }
  async createPlanVersion(actor: number, id: string, input: PlanInput) {
    this.validatePlan(input);
    return this.platform(async (tx) => {
      const plan = await this.persistence.collections.subscriptionPlan.findOne({
        where: { companyId: null, id },
        transaction: tx,
        forUpdate: true,
      });
      if (!plan || plan.status === 'ARCHIVED') throw fail('Plano inexistente ou arquivado.', 404);
      const catalog = await this.persistence.collections.subscriptionFeature.findAll({
          where: { companyId: null, status: 'ACTIVE' },
          transaction: tx,
        }),
        supported = new Set(catalog.map((row: any) => row.key));
      const unsupported = Object.keys(input.features)
        .map(featureCode)
        .filter((code) => !supported.has(code));
      if (unsupported.length)
        throw fail(`Funcionalidades não existentes no catálogo: ${unsupported.join(', ')}.`, 422);
      const latest = (await this.persistence.latestPlanVersion(id, tx)) || 0;
      const version = await this.create(
        null,
        this.persistence.collections.subscriptionPlanVersion,
        {
          id: randomUUID(),
          status: 'DRAFT',
          runId: id,
          key: `${id}:version:${latest + 1}`,
          version: latest + 1,
          data: { ...input, planId: id, createdBy: actor, version: latest + 1 },
        },
        tx,
      );
      for (const price of input.prices)
        await this.create(
          null,
          this.persistence.collections.subscriptionPlanPrice,
          {
            id: randomUUID(),
            status: 'ACTIVE',
            runId: version.id,
            key: `${version.id}:${price.currency}:${price.interval}`,
            data: { ...price, amount: money(price.amount), planVersionId: version.id },
          },
          tx,
        );
      for (const [code, value] of Object.entries(input.features))
        await this.create(
          null,
          this.persistence.collections.subscriptionPlanFeature,
          {
            id: randomUUID(),
            status: value ? 'ENABLED' : 'DISABLED',
            runId: version.id,
            key: `${version.id}:${featureCode(code)}`,
            data: { planVersionId: version.id, featureCode: featureCode(code), value },
          },
          tx,
        );
      for (const [metric, limit] of Object.entries(input.limits))
        await this.create(
          null,
          this.persistence.collections.subscriptionPlanLimit,
          {
            id: randomUUID(),
            status: 'ACTIVE',
            runId: version.id,
            key: `${version.id}:${metric}`,
            data: {
              planVersionId: version.id,
              metricCode: metric,
              value: limit.value,
              policy: limit.policy,
            },
          },
          tx,
        );
      await this.emit(
        null,
        'subscriptions.plan.version-created',
        version.id,
        { planId: id, version: latest + 1 },
        tx,
      );
      await this.audit.record({
        companyId: null,
        actorUserId: actor,
        action: 'SUBSCRIPTION_PLAN_VERSION_CREATED',
        entityType: 'SUBSCRIPTION_PLAN_VERSION',
        entityId: version.id,
        after: { planId: id, version: latest + 1 },
      });
      return this.present(version);
    });
  }
  async publishPlan(actor: number, id: string, versionId: string) {
    return this.platform(async (tx) => {
      const plan = await this.persistence.collections.subscriptionPlan.findOne({
        where: { companyId: null, id },
        transaction: tx,
        forUpdate: true,
      });
      const version = await this.persistence.collections.subscriptionPlanVersion.findOne({
        where: { companyId: null, id: versionId, runId: id },
        transaction: tx,
        forUpdate: true,
      });
      if (!plan || !version) throw fail('Plano ou versão não encontrado.', 404);
      if (plan.status === 'ARCHIVED')
        throw fail('Planos arquivados não podem ser publicados.', 409);
      if (version.status !== 'DRAFT')
        throw fail('Apenas versões em rascunho podem ser publicadas.', 409);
      if (!Array.isArray(version.data.prices) || !version.data.prices.length)
        throw fail('A versão deve possuir pelo menos um preço.');
      await this.persistence.update(
        version,
        {
          status: 'PUBLISHED',
          data: { ...version.data, publishedAt: new Date().toISOString(), publishedBy: actor },
        },
        { transaction: tx },
      );
      await this.persistence.update(
        plan,
        {
          status: 'PUBLISHED',
          data: { ...plan.data, currentVersionId: versionId, updatedAt: new Date().toISOString() },
        },
        { transaction: tx },
      );
      await this.emit(null, 'subscriptions.plan.published', versionId, { planId: id }, tx);
      return this.present(version);
    });
  }
  async archivePlan(actor: number, id: string) {
    const row = await this.platform(async (tx) => {
      const p = await this.persistence.collections.subscriptionPlan.findOne({
        where: { companyId: null, id },
        transaction: tx,
        forUpdate: true,
      });
      if (!p) throw fail('Plano não encontrado.', 404);
      await this.persistence.update(
        p,
        {
          status: 'ARCHIVED',
          data: { ...p.data, archivedAt: new Date().toISOString(), archivedBy: actor },
        },
        { transaction: tx },
      );
      await this.emit(null, 'subscriptions.plan.archived', id, {}, tx);
      return p;
    });
    await this.audit.record({
      companyId: null,
      actorUserId: actor,
      action: 'SUBSCRIPTION_PLAN_ARCHIVED',
      entityType: 'SUBSCRIPTION_PLAN',
      entityId: id,
    });
    return this.present(row);
  }
  async comparePlans(ids: string[]) {
    if (ids.length < 2 || ids.length > 10) throw fail('Compare entre 2 e 10 planos.');
    const plans = [];
    for (const id of ids) plans.push(await this.plan(id));
    return plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      currentVersion: plan.currentVersion,
    }));
  }
  private validatePlan(input: PlanInput) {
    if (!input.code || !/^[A-Za-z0-9_-]{2,40}$/.test(input.code) || !input.name?.trim())
      throw fail('Código e nome de plano são obrigatórios.');
    if (!['FREE', 'TRIAL', 'STANDARD', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM'].includes(input.type))
      throw fail('Tipo de plano inválido.');
    for (const p of input.prices || []) {
      if (!/^[A-Z]{3}$/.test(p.currency)) throw fail('Moeda ISO inválida.');
      money(p.amount);
    }
    for (const metric of Object.keys(input.limits || {}))
      if (!SUBSCRIPTION_METRICS.includes(metric as any))
        throw fail(`Métrica não suportada: ${metric}`);
  }
  private async emitPlatform(event: string, id: string, data: Record<string, any>) {
    await this.platform((tx) => this.emit(null, event, id, data, tx));
  }

  async createSubscription(
    companyId: number,
    actor: number,
    input: {
      planVersionId: string;
      interval: BillingInterval;
      trialDays?: number;
      idempotencyKey: string;
    },
  ) {
    if (!['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'CUSTOM'].includes(input.interval))
      throw fail('Periodicidade inválida.');
    return this.tenant(companyId, async (tx) => {
      const requestHash = JSON.stringify({
        planVersionId: input.planVersionId,
        interval: input.interval,
        trialDays: input.trialDays || 0,
      });
      const prior = await this.persistence.collections.tenantSubscription.findOne({
        where: { companyId, key: `create:${input.idempotencyKey}` },
        transaction: tx,
      });
      if (prior) {
        if (prior.data.requestHash !== requestHash)
          throw fail('Chave de idempotência reutilizada com conteúdo diferente.', 409);
        return { ...this.present(prior), idempotent: true };
      }
      const current = await this.persistence.collections.tenantSubscription.findOne({
        where: {
          companyId,
          status: {
            [Op.in]: ['TRIALING', 'ACTIVE', 'GRACE_PERIOD', 'PENDING_PAYMENT', 'SUSPENDED'],
          },
        },
        transaction: tx,
        forUpdate: true,
      });
      if (current) throw fail('A empresa já possui uma subscrição vigente ou pendente.', 409);
      const version = await this.persistence.collections.subscriptionPlanVersion.findOne({
        where: { companyId: null, id: input.planVersionId, status: 'PUBLISHED' },
        transaction: tx,
      });
      if (!version) throw fail('Versão publicada não encontrada.', 404);
      const prices = await this.persistence.collections.subscriptionPlanPrice.findAll({
        where: { companyId: null, runId: version.id, status: 'ACTIVE' },
        transaction: tx,
      });
      const price = prices.find((row: any) => row.data.interval === input.interval);
      if (!price && version.data.type !== 'FREE')
        throw fail('O plano não possui preço para a periodicidade escolhida.', 422);
      const policy = await this.policy(companyId),
        now = new Date(),
        trialDays = Math.min(
          90,
          Math.max(
            0,
            input.trialDays ?? (version.data.type === 'TRIAL' ? Number(policy.trialDays || 14) : 0),
          ),
        );
      let status: string, ends: Date;
      if (version.data.type === 'TRIAL' && trialDays === 0)
        throw fail('O plano de avaliação exige duração positiva.', 422);
      if (trialDays) {
        const previous = await this.persistence.collections.subscriptionTrial.findOne({
          where: { companyId },
          transaction: tx,
        });
        if (previous && policy.trialEligibleOnce !== false)
          throw fail('A empresa já utilizou um período de avaliação.', 409);
        status = 'TRIALING';
        ends = new Date(now.getTime() + trialDays * 86400000);
      } else if (!price || Number(price.data.amount) === 0) {
        status = 'ACTIVE';
        ends = addInterval(now, input.interval, version.data.customDays);
      } else {
        status = 'PENDING_PAYMENT';
        ends = now;
      }
      const id = randomUUID(),
        data = {
          planId: version.runId,
          planVersionId: version.id,
          interval: input.interval,
          startedAt: now.toISOString(),
          currentPeriodStart: now.toISOString(),
          currentPeriodEnd: ends.toISOString(),
          renewalAtPeriodEnd: true,
          cancelAtPeriodEnd: false,
          createdBy: actor,
          trialDays,
          requestHash,
          price: price?.data || { currency: 'AOA', amount: '0.00' },
        };
      const sub = await this.create(
        companyId,
        this.persistence.collections.tenantSubscription,
        { id, status, key: `create:${input.idempotencyKey}`, version: version.version, data },
        tx,
      );
      if (trialDays) {
        await this.create(
          companyId,
          this.persistence.collections.subscriptionTrial,
          {
            id: randomUUID(),
            status: 'ACTIVE',
            runId: id,
            key: `trial:${companyId}:${id}`,
            data: {
              subscriptionId: id,
              startsAt: now.toISOString(),
              endsAt: ends.toISOString(),
              days: trialDays,
              createdBy: actor,
            },
          },
          tx,
        );
      }
      if (status === 'ACTIVE' || status === 'TRIALING')
        await this.startPeriod(
          companyId,
          sub,
          now,
          ends,
          status === 'TRIALING' ? 'TRIAL' : 'COMMERCIAL',
          tx,
        );
      else
        await this.emit(
          companyId,
          'platform-billing.invoice.requested',
          id,
          {
            tenantId: companyId,
            planVersionId: version.id,
            price: price?.data,
            interval: input.interval,
          },
          tx,
        );
      await this.transition(companyId, sub, null, status, 'SUBSCRIPTION_CREATED', actor, tx);
      await this.emit(
        companyId,
        'subscriptions.subscription.created',
        id,
        { status, planVersionId: version.id },
        tx,
      );
      return this.present(sub);
    });
  }
  private async startPeriod(
    companyId: number,
    sub: SubscriptionRecord,
    start: Date,
    end: Date,
    kind: string,
    tx: RecordStoreContext,
  ) {
    const old = await this.persistence.collections.subscriptionPeriod.findOne({
      where: { companyId, runId: sub.id, status: 'ACTIVE' },
      transaction: tx,
      forUpdate: true,
    });
    if (old)
      await this.persistence.update(
        old,
        { status: 'ENDED', data: { ...old.data, endedAt: start.toISOString() } },
        { transaction: tx },
      );
    const id = randomUUID();
    return this.create(
      companyId,
      this.persistence.collections.subscriptionPeriod,
      {
        id,
        status: 'ACTIVE',
        runId: sub.id,
        key: `period:${sub.id}:${start.toISOString()}`,
        data: {
          subscriptionId: sub.id,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          kind,
        },
      },
      tx,
    );
  }
  private async transition(
    companyId: number,
    sub: SubscriptionRecord,
    from: string | null,
    to: string,
    reason: string,
    actor: number,
    tx: RecordStoreContext,
  ) {
    await this.create(
      companyId,
      this.persistence.collections.subscriptionTransition,
      {
        id: randomUUID(),
        status: 'RECORDED',
        runId: sub.id,
        key: `transition:${sub.id}:${randomUUID()}`,
        data: {
          subscriptionId: sub.id,
          fromStatus: from,
          toStatus: to,
          reason,
          actorUserId: actor,
          at: new Date().toISOString(),
        },
      },
      tx,
    );
  }
  async current(companyId: number) {
    return this.tenant(companyId, async (tx) => {
      const row = await this.persistence.collections.tenantSubscription.findOne({
        where: { companyId, status: { [Op.notIn]: ['CANCELLED', 'EXPIRED'] } },
        order: [['createdAt', 'DESC']],
        transaction: tx,
      });
      if (!row) return null;
      return this.subscriptionView(row, tx);
    });
  }
  private async subscriptionView(row: SubscriptionRecord, tx: RecordStoreContext) {
    const periods = await this.persistence.collections.subscriptionPeriod.findAll({
      where: { companyId: row.companyId, runId: row.id },
      order: [['createdAt', 'DESC']],
      transaction: tx,
    });
    const trial = await this.persistence.collections.subscriptionTrial.findOne({
      where: { companyId: row.companyId, runId: row.id },
      transaction: tx,
    });
    const version = await this.persistence.collections.subscriptionPlanVersion.findOne({
      where: { companyId: null, id: row.data.planVersionId },
    });
    return {
      ...this.present(row),
      periods: periods.map((p: any) => this.present(p)),
      trial: trial ? this.present(trial) : null,
      planVersion: version ? this.present(version) : null,
    };
  }
  async cancel(companyId: number, actor: number, id: string, atPeriodEnd: boolean, reason: string) {
    return this.tenant(companyId, async (tx) => {
      const row = await this.one(
        companyId,
        this.persistence.collections.tenantSubscription,
        id,
        tx,
      );
      if (!['ACTIVE', 'TRIALING', 'GRACE_PERIOD', 'PENDING_PAYMENT'].includes(row.status))
        throw fail('Subscrição não pode ser cancelada neste estado.', 409);
      if (atPeriodEnd) {
        await this.persistence.update(
          row,
          {
            data: {
              ...row.data,
              cancelAtPeriodEnd: true,
              cancelReason: reason,
              cancelRequestedAt: new Date().toISOString(),
            },
          },
          { transaction: tx },
        );
      } else {
        const from = row.status;
        await this.persistence.update(
          row,
          {
            status: 'CANCELLED',
            data: { ...row.data, cancelledAt: new Date().toISOString(), cancelReason: reason },
          },
          { transaction: tx },
        );
        await this.transition(companyId, row, from, 'CANCELLED', reason, actor, tx);
      }
      await this.emit(
        companyId,
        'subscriptions.subscription.cancelled',
        id,
        { atPeriodEnd, reason },
        tx,
      );
      return this.present(row);
    });
  }
  async reactivate(companyId: number, actor: number, id: string) {
    return this.tenant(companyId, async (tx) => {
      const row = await this.one(
        companyId,
        this.persistence.collections.tenantSubscription,
        id,
        tx,
      );
      if (row.status === 'CANCELLED' && row.data.cancelAtPeriodEnd) {
        await this.persistence.update(
          row,
          { status: 'ACTIVE', data: { ...row.data, cancelAtPeriodEnd: false, cancelledAt: null } },
          { transaction: tx },
        );
        await this.transition(
          companyId,
          row,
          'CANCELLED',
          'ACTIVE',
          'CANCELATION_REVERSED',
          actor,
          tx,
        );
      } else if (row.status === 'SUSPENDED' || row.status === 'GRACE_PERIOD') {
        await this.persistence.update(
          row,
          {
            status: 'ACTIVE',
            data: { ...row.data, graceEndsAt: null, reactivatedAt: new Date().toISOString() },
          },
          { transaction: tx },
        );
        await this.transition(companyId, row, row.status, 'ACTIVE', 'REACTIVATED', actor, tx);
      } else throw fail('Subscrição não pode ser reactivada.', 409);
      await this.emit(companyId, 'subscriptions.subscription.reactivated', id, {}, tx);
      return this.present(row);
    });
  }
  async requestChange(
    companyId: number,
    actor: number,
    input: {
      subscriptionId: string;
      planVersionId: string;
      interval?: BillingInterval;
      reason: string;
    },
  ) {
    return this.tenant(companyId, async (tx) => {
      const sub = await this.one(
        companyId,
        this.persistence.collections.tenantSubscription,
        input.subscriptionId,
        tx,
      );
      if (!['ACTIVE', 'TRIALING'].includes(sub.status))
        throw fail('Subscrição não permite alterações neste estado.', 409);
      const target = await this.persistence.collections.subscriptionPlanVersion.findOne({
        where: { companyId: null, id: input.planVersionId, status: 'PUBLISHED' },
      });
      if (!target) throw fail('Plano pretendido não está publicado.', 404);
      const req = await this.create(
        companyId,
        this.persistence.collections.subscriptionChangeRequest,
        {
          id: randomUUID(),
          status: 'PENDING',
          runId: sub.id,
          key: `change:${sub.id}:${randomUUID()}`,
          data: {
            subscriptionId: sub.id,
            fromPlanVersionId: sub.data.planVersionId,
            targetPlanVersionId: target.id,
            interval: input.interval || sub.data.interval,
            reason: input.reason,
            requestedBy: actor,
            direction: 'UNCLASSIFIED',
          },
        },
        tx,
      );
      await this.emit(
        companyId,
        'subscriptions.change.requested',
        req.id,
        { subscriptionId: sub.id, targetPlanVersionId: target.id },
        tx,
      );
      return this.present(req);
    });
  }
  async decideChange(
    companyId: number,
    actor: number,
    id: string,
    approve: boolean,
    reason?: string,
  ) {
    return this.tenant(companyId, async (tx) => {
      const req = await this.one(
        companyId,
        this.persistence.collections.subscriptionChangeRequest,
        id,
        tx,
      );
      if (req.status !== 'PENDING') throw fail('Pedido já decidido.', 409);
      if (approve && req.data.requestedBy === actor)
        throw fail('O requerente não pode aprovar a própria alteração.', 403);
      const sub = await this.one(
        companyId,
        this.persistence.collections.tenantSubscription,
        req.runId!,
        tx,
      );
      if (approve) {
        await this.assertPlanSupportsUsage(companyId, req.data.targetPlanVersionId, sub.id, tx);
        const version = await this.persistence.collections.subscriptionPlanVersion.findOne({
          where: { companyId: null, id: req.data.targetPlanVersionId },
        });
        if (!version) throw fail('Versão do plano não encontrada.', 404);
        const downgrade = await this.isDowngrade(sub, version);
        const now = new Date(),
          at = downgrade ? new Date(sub.data.currentPeriodEnd) : now;
        const needsPayment = !downgrade && (await this.hasPriceIncrease(sub, version));
        const outcome = downgrade ? 'SCHEDULED' : needsPayment ? 'AWAITING_PAYMENT' : 'APPROVED';
        await this.persistence.update(
          req,
          {
            status: outcome,
            data: {
              ...req.data,
              approvedBy: actor,
              decisionReason: reason || null,
              approvedAt: now.toISOString(),
              effectiveAt: at.toISOString(),
            },
          },
          { transaction: tx },
        );
        if (!downgrade && !needsPayment)
          await this.applyPlan(companyId, sub, version, actor, tx, req.data.interval);
        if (needsPayment) {
          await this.persistence.update(
            sub,
            {
              data: {
                ...sub.data,
                pendingPlanVersionId: version.id,
                pendingInterval: req.data.interval,
                pendingChangeRequestId: req.id,
              },
            },
            { transaction: tx },
          );
          await this.emit(
            companyId,
            'platform-billing.invoice.requested',
            sub.id,
            {
              subscriptionId: sub.id,
              changeRequestId: req.id,
              planVersionId: version.id,
              interval: req.data.interval,
              upgrade: true,
            },
            tx,
          );
        }
        await this.create(
          companyId,
          this.persistence.collections.subscriptionApproval,
          {
            id: randomUUID(),
            status: 'APPROVED',
            runId: req.id,
            key: `approval:${req.id}`,
            data: {
              changeRequestId: req.id,
              actorUserId: actor,
              reason: reason || null,
              decision: 'APPROVED',
            },
          },
          tx,
        );
        await this.emit(
          companyId,
          'subscriptions.change.approved',
          req.id,
          { subscriptionId: sub.id, effectiveAt: at.toISOString(), awaitingPayment: needsPayment },
          tx,
        );
      } else {
        await this.persistence.update(
          req,
          {
            status: 'REJECTED',
            data: {
              ...req.data,
              rejectedBy: actor,
              decisionReason: reason || null,
              rejectedAt: new Date().toISOString(),
            },
          },
          { transaction: tx },
        );
        await this.emit(companyId, 'subscriptions.change.rejected', req.id, { reason }, tx);
      }
      return this.present(req);
    });
  }
  private async isDowngrade(sub: SubscriptionRecord, target: SubscriptionRecord) {
    const current = await this.persistence.collections.subscriptionPlanVersion.findOne({
        where: { companyId: null, id: sub.data.planVersionId },
      }),
      oldData = (current as any)?.data || {},
      nextData = (target as any).data || {};
    const currentPrice = Number(
        oldData.prices?.find((p: any) => p.interval === sub.data.interval)?.amount || 0,
      ),
      targetPrice = Number(
        nextData.prices?.find((p: any) => p.interval === sub.data.interval)?.amount || 0,
      );
    if (targetPrice < currentPrice) return true;
    for (const [metric, oldLimit] of Object.entries(oldData.limits || {})) {
      const next: any = (nextData.limits || {})[metric],
        prior: any = oldLimit;
      if (
        next &&
        prior &&
        next.value !== null &&
        prior.value !== null &&
        Number(next.value) < Number(prior.value)
      )
        return true;
    }
    for (const [feature, enabled] of Object.entries(oldData.features || {}))
      if (Boolean(enabled) && !(nextData.features || {})[feature]) return true;
    return false;
  }
  private async hasPriceIncrease(sub: SubscriptionRecord, target: SubscriptionRecord) {
    const current = await this.persistence.collections.subscriptionPlanVersion.findOne({
      where: { companyId: null, id: sub.data.planVersionId },
    });
    const oldPrice = Number(
      (current as any)?.data.prices?.find((p: any) => p.interval === sub.data.interval)?.amount ||
        0,
    );
    const newPrice = Number(
      (target as any).data.prices?.find((p: any) => p.interval === sub.data.interval)?.amount || 0,
    );
    return newPrice > oldPrice;
  }
  private async assertPlanSupportsUsage(
    companyId: number,
    versionId: string,
    subId: string,
    tx: RecordStoreContext,
  ) {
    const limits = await this.persistence.collections.subscriptionPlanLimit.findAll({
      where: { companyId: null, runId: versionId },
      transaction: tx,
    });
    for (const limit of limits) {
      const cap = limit.data.value;
      if (cap === null || cap === undefined) continue;
      const accounts = await this.persistence.collections.subscriptionUsageAccount.findAll({
        where: { companyId, employeeId: null },
        transaction: tx,
      });
      for (const acc of accounts) {
        if (acc.data.subscriptionId !== subId || acc.data.metricCode !== limit.data.metricCode)
          continue;
        const resetsMonthly = [
          'PAYROLL_EMPLOYEES_PER_PERIOD',
          'REPORT_EXPORTS',
          'SIMULATION_RUNS',
          'API_REQUESTS',
        ].includes(limit.data.metricCode);
        if (resetsMonthly && acc.data.periodKey !== periodKey()) continue;
        if (Number(acc.data.used || 0) + Number(acc.data.reserved || 0) > Number(cap))
          throw fail(
            `A utilização actual excede o limite de downgrade para ${limit.data.metricCode}.`,
            409,
          );
      }
    }
  }
  private async applyPlan(
    companyId: number,
    sub: SubscriptionRecord,
    version: SubscriptionRecord,
    actor: number,
    tx: RecordStoreContext,
    interval?: string,
  ) {
    const old = sub.data.planVersionId;
    await this.persistence.update(
      sub,
      {
        version: sub.version + 1,
        data: {
          ...sub.data,
          planId: version.runId,
          planVersionId: version.id,
          interval: interval || sub.data.interval,
          updatedAt: new Date().toISOString(),
        },
      },
      { transaction: tx },
    );
    await this.rebuildEntitlements(companyId, sub, version, tx);
    await this.transition(companyId, sub, sub.status, sub.status, 'PLAN_CHANGED', actor, tx);
    await this.emit(
      companyId,
      'subscriptions.entitlements.changed',
      sub.id,
      { fromVersionId: old, toVersionId: version.id },
      tx,
    );
  }
  async applyScheduledChanges(companyId: number) {
    return this.tenant(companyId, async (tx) => {
      const rows = await this.persistence.collections.subscriptionChangeRequest.findAll({
        where: { companyId, status: 'SCHEDULED' },
        transaction: tx,
        forUpdate: true,
      });
      let applied = 0;
      for (const req of rows) {
        if (new Date(req.data.effectiveAt) > new Date()) continue;
        const sub = await this.one(
            companyId,
            this.persistence.collections.tenantSubscription,
            req.runId!,
            tx,
          ),
          version = await this.persistence.collections.subscriptionPlanVersion.findOne({
            where: { companyId: null, id: req.data.targetPlanVersionId },
            transaction: tx,
          });
        if (!version) continue;
        try {
          await this.assertPlanSupportsUsage(companyId, req.data.targetPlanVersionId, sub.id, tx);
        } catch (error) {
          await this.persistence.update(
            req,
            {
              status: 'BLOCKED_BY_USAGE',
              data: {
                ...req.data,
                blockedAt: new Date().toISOString(),
                blockReason:
                  error instanceof Error ? error.message : 'Uso acima do limite proposto.',
              },
            },
            { transaction: tx },
          );
          continue;
        }
        await this.applyPlan(companyId, sub, version, req.data.approvedBy, tx, req.data.interval);
        await this.persistence.update(
          req,
          { status: 'APPLIED', data: { ...req.data, appliedAt: new Date().toISOString() } },
          { transaction: tx },
        );
        applied++;
      }
      return applied;
    });
  }
  private async rebuildEntitlements(
    companyId: number,
    sub: SubscriptionRecord,
    version: SubscriptionRecord,
    tx: RecordStoreContext,
  ) {
    const features = await this.persistence.collections.subscriptionPlanFeature.findAll({
      where: { companyId: null, runId: version.id },
      transaction: tx,
    });
    for (const f of features)
      await this.create(
        companyId,
        this.persistence.collections.subscriptionEntitlement,
        {
          id: randomUUID(),
          status: f.data.value ? 'ALLOWED' : 'DENIED',
          runId: sub.id,
          key: `${sub.id}:${f.data.featureCode}:${sub.version + 1}`,
          data: {
            subscriptionId: sub.id,
            featureCode: f.data.featureCode,
            value: f.data.value,
            planVersionId: version.id,
            version: sub.version + 1,
          },
        },
        tx,
      );
  }

  async checkFeature(companyId: number, feature: string): Promise<EntitlementDecision> {
    const sub = await this.tenant(companyId, (tx) =>
      this.persistence.collections.tenantSubscription.findOne({
        where: { companyId, status: { [Op.in]: ['ACTIVE', 'TRIALING', 'GRACE_PERIOD'] } },
        order: [['createdAt', 'DESC']],
        transaction: tx,
      }),
    );
    if (!sub)
      return { allowed: false, reason: 'NO_ACTIVE_SUBSCRIPTION', entitlementVersion: 'none' };
    if (sub.status === 'SUSPENDED' || sub.status === 'EXPIRED' || sub.status === 'CANCELLED')
      return {
        allowed: false,
        reason: `SUBSCRIPTION_${sub.status}`,
        entitlementVersion: String(sub.version),
      };
    const override = await this.tenant(companyId, (tx) =>
      this.persistence.collections.subscriptionOverride.findOne({
        where: { companyId, runId: sub.id, status: 'ACTIVE' },
        transaction: tx,
      }),
    );
    if (
      override &&
      (!override.data.expiresAt || new Date(override.data.expiresAt) > new Date()) &&
      override.data.features?.[featureCode(feature)] !== undefined
    )
      return {
        allowed: Boolean(override.data.features[featureCode(feature)]),
        entitlementVersion: `${sub.version}:override:${override.version}`,
      };
    const version = await this.persistence.collections.subscriptionPlanVersion.findOne({
      where: { companyId: null, id: sub.data.planVersionId },
    });
    const row = await this.persistence.collections.subscriptionPlanFeature.findOne({
      where: {
        companyId: null,
        runId: sub.data.planVersionId,
        key: `${sub.data.planVersionId}:${featureCode(feature)}`,
      },
    });
    return {
      allowed: row ? Boolean(row.data.value) : Boolean((version as any)?.data.features?.[feature]),
      reason: row ? undefined : 'FEATURE_NOT_INCLUDED',
      entitlementVersion: `${sub.version}:${sub.data.planVersionId}`,
    };
  }
  async getLimit(companyId: number, metric: string): Promise<SubscriptionLimit> {
    if (!SUBSCRIPTION_METRICS.includes(metric as any)) throw fail('Métrica inválida.');
    const sub = await this.tenant(companyId, (tx) =>
      this.persistence.collections.tenantSubscription.findOne({
        where: { companyId, status: { [Op.in]: ['ACTIVE', 'TRIALING', 'GRACE_PERIOD'] } },
        order: [['createdAt', 'DESC']],
        transaction: tx,
      }),
    );
    if (!sub) return { limit: '0', used: '0', reserved: '0' };
    const plan = await this.persistence.collections.subscriptionPlanLimit.findOne({
      where: {
        companyId: null,
        runId: sub.data.planVersionId,
        key: `${sub.data.planVersionId}:${metric}`,
      },
    });
    const override = await this.tenant(companyId, (tx) =>
      this.persistence.collections.subscriptionOverride.findOne({
        where: { companyId, runId: sub.id, status: 'ACTIVE' },
        transaction: tx,
      }),
    );
    const limit =
      override &&
      (!override.data.expiresAt || new Date(override.data.expiresAt) > new Date()) &&
      override.data.limits?.[metric] !== undefined
        ? override.data.limits[metric]
        : (plan?.data.value ?? null);
    const period = [
      'PAYROLL_EMPLOYEES_PER_PERIOD',
      'REPORT_EXPORTS',
      'SIMULATION_RUNS',
      'API_REQUESTS',
    ].includes(metric)
      ? periodKey()
      : `lifetime:${sub.id}`;
    const account = await this.getOrCreateAccount(companyId, sub.id, metric, period, limit);
    return {
      limit: limit === null ? null : String(limit),
      used: String(account.data.used),
      reserved: String(account.data.reserved),
      resetAt: account.data.resetAt,
    };
  }
  private async getOrCreateAccount(
    companyId: number,
    subscriptionId: string,
    metric: string,
    period: string,
    limit: string | null,
    tx?: RecordStoreContext,
  ) {
    const fn = async (t: RecordStoreContext) => {
      let row = await this.persistence.collections.subscriptionUsageAccount.findOne({
        where: { companyId, key: `${subscriptionId}:${metric}:${period}` },
        transaction: t,
        forUpdate: true,
      });
      if (!row)
        row = await this.create(
          companyId,
          this.persistence.collections.subscriptionUsageAccount,
          {
            id: randomUUID(),
            status: 'ACTIVE',
            runId: subscriptionId,
            key: `${subscriptionId}:${metric}:${period}`,
            data: {
              subscriptionId,
              metricCode: metric,
              periodKey: period,
              limit,
              used: '0',
              reserved: '0',
              policy: 'HARD',
            },
          },
          t,
        );
      return row;
    };
    return tx ? fn(tx) : this.tenant(companyId, fn);
  }
  async reserve(
    companyId: number,
    input: {
      metricCode: string;
      quantity: string | number;
      operationKey: string;
      reservationSeconds?: number;
    },
  ) {
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || !input.operationKey)
      throw fail('Quantidade e chave de operação são obrigatórias.');
    return this.tenant(companyId, async (tx) => {
      const sub = await this.persistence.collections.tenantSubscription.findOne({
        where: { companyId, status: { [Op.in]: ['ACTIVE', 'TRIALING', 'GRACE_PERIOD'] } },
        order: [['createdAt', 'DESC']],
        transaction: tx,
        forUpdate: true,
      });
      if (!sub) throw fail('Empresa sem subscrição activa.', 402);
      const limit = await this.persistence.collections.subscriptionPlanLimit.findOne({
        where: {
          companyId: null,
          runId: sub.data.planVersionId,
          key: `${sub.data.planVersionId}:${input.metricCode}`,
        },
        transaction: tx,
      });
      const override = await this.persistence.collections.subscriptionOverride.findOne({
        where: { companyId, runId: sub.id, status: 'ACTIVE' },
        transaction: tx,
      });
      const overrideLimit =
        override && (!override.data.expiresAt || new Date(override.data.expiresAt) > new Date())
          ? override.data.limits?.[input.metricCode]
          : undefined;
      const effectiveLimit =
        overrideLimit !== undefined ? overrideLimit : (limit?.data.value ?? null);
      const period = periodKey();
      const account = await this.getOrCreateAccount(
        companyId,
        sub.id,
        input.metricCode,
        period,
        effectiveLimit,
        tx,
      );
      if (account.data.limit !== effectiveLimit)
        await this.persistence.update(
          account,
          { data: { ...account.data, limit: effectiveLimit } },
          { transaction: tx },
        );
      const key = `op:${input.metricCode}:${input.operationKey}`;
      const prior = await this.persistence.collections.subscriptionUsageReservation.findOne({
        where: { companyId, key },
        transaction: tx,
      });
      if (prior)
        return { reservationId: prior.id, allowed: true, idempotent: true, status: prior.status };
      const policyCode = limit?.data.policy || 'HARD';
      if (account.data.policy !== policyCode)
        await this.persistence.update(
          account,
          { data: { ...account.data, policy: policyCode } },
          { transaction: tx },
        );
      const max = account.data.limit === null ? Infinity : Number(account.data.limit),
        used = Number(account.data.used),
        reserved = Number(account.data.reserved),
        exceeds = used + reserved + quantity > max;
      if (exceeds && policyCode === 'HARD') {
        await this.emit(
          companyId,
          'subscriptions.usage.limit-reached',
          account.id,
          { metricCode: input.metricCode, limit: max, used, reserved, requested: quantity },
          tx,
        );
        return { reservationId: null, allowed: false, reason: 'LIMIT_REACHED' };
      }
      const reservation = await this.create(
        companyId,
        this.persistence.collections.subscriptionUsageReservation,
        {
          id: randomUUID(),
          status: 'RESERVED',
          runId: account.id,
          key,
          data: {
            accountId: account.id,
            subscriptionId: sub.id,
            metricCode: input.metricCode,
            quantity: String(quantity),
            operationKey: input.operationKey,
            overage: exceeds && policyCode === 'OVERAGE',
            expiresAt: new Date(
              Date.now() + (input.reservationSeconds || 3600) * 1000,
            ).toISOString(),
          },
        },
        tx,
      );
      if (exceeds && policyCode === 'SOFT')
        await this.emit(
          companyId,
          'subscriptions.usage.limit-reached',
          reservation.id,
          {
            metricCode: input.metricCode,
            limit: max,
            used,
            reserved,
            requested: quantity,
            excess: Math.max(0, used + reserved + quantity - max),
          },
          tx,
        );
      await this.persistence.update(
        account,
        { data: { ...account.data, reserved: String(reserved + quantity) } },
        { transaction: tx },
      );
      await this.emit(
        companyId,
        'subscriptions.usage.reserved',
        reservation.id,
        { metricCode: input.metricCode, quantity: String(quantity) },
        tx,
      );
      return { reservationId: reservation.id, allowed: true, status: 'RESERVED' };
    });
  }
  async settleReservation(companyId: number, id: string, commit: boolean) {
    return this.tenant(companyId, async (tx) => {
      const r = await this.one(
        companyId,
        this.persistence.collections.subscriptionUsageReservation,
        id,
        tx,
      );
      if (r.status === 'COMMITTED' || r.status === 'RELEASED')
        return { status: r.status, idempotent: true };
      if (r.status !== 'RESERVED') throw fail('Reserva não está disponível para conclusão.', 409);
      const account = await this.one(
          companyId,
          this.persistence.collections.subscriptionUsageAccount,
          r.runId!,
          tx,
        ),
        qty = Number(r.data.quantity);
      await this.persistence.update(
        account,
        {
          data: {
            ...account.data,
            reserved: String(Math.max(0, Number(account.data.reserved) - qty)),
            used: String(Number(account.data.used) + (commit ? qty : 0)),
          },
        },
        { transaction: tx },
      );
      await this.persistence.update(
        r,
        {
          status: commit ? 'COMMITTED' : 'RELEASED',
          data: { ...r.data, settledAt: new Date().toISOString() },
        },
        { transaction: tx },
      );
      if (commit)
        await this.create(
          companyId,
          this.persistence.collections.subscriptionUsageRecord,
          {
            id: randomUUID(),
            status: 'COMMITTED',
            runId: account.id,
            key: `usage:${r.data.metricCode}:${r.data.operationKey}`,
            data: {
              accountId: account.id,
              metricCode: r.data.metricCode,
              quantity: r.data.quantity,
              operationKey: r.data.operationKey,
            },
          },
          tx,
        );
      if (commit && r.data.overage)
        await this.emit(
          companyId,
          'platform-billing.overage.committed',
          id,
          {
            metricCode: r.data.metricCode,
            quantity: r.data.quantity,
            operationKey: r.data.operationKey,
          },
          tx,
        );
      await this.emit(
        companyId,
        commit ? 'subscriptions.usage.committed' : 'subscriptions.usage.released',
        id,
        { metricCode: r.data.metricCode, quantity: r.data.quantity },
        tx,
      );
      return { status: r.status };
    });
  }
  async usage(companyId: number, metric?: string) {
    const sub = await this.tenant(companyId, (tx) =>
      this.persistence.collections.tenantSubscription.findOne({
        where: { companyId },
        order: [['createdAt', 'DESC']],
        transaction: tx,
      }),
    );
    if (!sub) return [];
    const rows = await this.tenant(companyId, (tx) =>
      this.persistence.collections.subscriptionUsageAccount.findAll({
        where: { companyId, ...(metric ? { key: { [Op.like]: `%:${metric}:%` } } : {}) },
        order: [['updatedAt', 'DESC']],
        limit: 500,
        transaction: tx,
      }),
    );
    return rows.filter((row) => row.data.subscriptionId === sub.id).map((row) => this.present(row));
  }
  async history(companyId: number, id: string) {
    await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.tenantSubscription, id, tx),
    );
    const rows = await this.tenant(companyId, (tx) =>
      this.persistence.collections.subscriptionTransition.findAll({
        where: { companyId, runId: id },
        order: [['createdAt', 'DESC']],
        transaction: tx,
      }),
    );
    return rows.map((r: any) => this.present(r));
  }
  async platformSubscription(companyId: number) {
    return this.tenant(companyId, async (tx) => {
      const row = await this.persistence.collections.tenantSubscription.findOne({
        where: { companyId },
        order: [['createdAt', 'DESC']],
        transaction: tx,
      });
      return row ? this.subscriptionView(row, tx) : null;
    });
  }
  async setStatus(
    companyId: number,
    actor: number,
    status: 'SUSPENDED' | 'ACTIVE',
    reason: string,
  ) {
    return this.tenant(companyId, async (tx) => {
      const sub = await this.persistence.collections.tenantSubscription.findOne({
        where: { companyId, status: { [Op.notIn]: ['CANCELLED', 'EXPIRED'] } },
        order: [['createdAt', 'DESC']],
        transaction: tx,
        forUpdate: true,
      });
      if (!sub) throw fail('Subscrição vigente não encontrada.', 404);
      const from = sub.status;
      await this.persistence.update(
        sub,
        {
          status,
          data: {
            ...sub.data,
            [status === 'SUSPENDED' ? 'suspendedAt' : 'reactivatedAt']: new Date().toISOString(),
            reason,
          },
        },
        { transaction: tx },
      );
      await this.transition(companyId, sub, from, status, reason, actor, tx);
      await this.emit(
        companyId,
        status === 'SUSPENDED'
          ? 'subscriptions.subscription.suspended'
          : 'subscriptions.subscription.reactivated',
        sub.id,
        { reason },
        tx,
      );
      return this.present(sub);
    });
  }
  async createOverride(
    companyId: number,
    actor: number,
    input: {
      subscriptionId: string;
      features?: Record<string, boolean>;
      limits?: Record<string, string | null>;
      reason: string;
      expiresAt?: string;
    },
  ) {
    return this.tenant(companyId, async (tx) => {
      await this.one(
        companyId,
        this.persistence.collections.tenantSubscription,
        input.subscriptionId,
        tx,
      );
      const row = await this.create(
        companyId,
        this.persistence.collections.subscriptionOverride,
        {
          id: randomUUID(),
          status: 'ACTIVE',
          runId: input.subscriptionId,
          key: `override:${input.subscriptionId}:${randomUUID()}`,
          data: { ...input, createdBy: actor, createdAt: new Date().toISOString() },
        },
        tx,
      );
      await this.emit(
        companyId,
        'subscriptions.entitlements.changed',
        row.id,
        { subscriptionId: input.subscriptionId, override: true },
        tx,
      );
      return this.present(row);
    });
  }
  async policy(companyId?: number) {
    const where = { companyId: companyId ?? null, key: 'policy' };
    const row = await this.persistence.collections.subscriptionPolicy.findOne({ where });
    return row?.data || { trialDays: 14, graceDays: 7, renewalNoticeDays: 30, allowOverage: false };
  }
  async updatePolicy(actor: number, input: Record<string, any>) {
    const row = await this.platform(async (tx) => {
      const old = await this.persistence.collections.subscriptionPolicy.findOne({
        where: { companyId: null, key: 'policy' },
        transaction: tx,
      });
      if (old) {
        await this.persistence.update(
          old,
          { data: { ...old.data, ...input, updatedBy: actor } },
          { transaction: tx },
        );
        return old;
      }
      return this.create(
        null,
        this.persistence.collections.subscriptionPolicy,
        { id: randomUUID(), status: 'ACTIVE', key: 'policy', data: { ...input, updatedBy: actor } },
        tx,
      );
    });
    await this.audit.record({
      companyId: null,
      actorUserId: actor,
      action: 'SUBSCRIPTION_POLICY_UPDATED',
      entityType: 'SUBSCRIPTION_POLICY',
      entityId: row.id,
      after: input,
    });
    return this.present(row);
  }
  async features() {
    const rows = await this.persistence.collections.subscriptionFeature.findAll({
      where: { companyId: null, status: 'ACTIVE' },
      order: [['key', 'ASC']],
    });
    return rows.map((r: any) => this.present(r));
  }
  async createFeature(actor: number, input: { code: string; name: string; description?: string }) {
    const code = featureCode(input.code);
    if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(code) || !input.name.trim())
      throw fail('Código ou nome de funcionalidade inválido.');
    const row = await this.platform(async (tx) => {
      const old = await this.persistence.collections.subscriptionFeature.findOne({
        where: { companyId: null, key: code },
        transaction: tx,
      });
      if (old) throw fail('Funcionalidade já existe.', 409);
      return this.create(
        null,
        this.persistence.collections.subscriptionFeature,
        {
          id: randomUUID(),
          status: 'ACTIVE',
          key: code,
          data: {
            code,
            name: input.name.trim(),
            description: input.description || null,
            createdBy: actor,
          },
        },
        tx,
      );
    });
    await this.audit.record({
      companyId: null,
      actorUserId: actor,
      action: 'SUBSCRIPTION_FEATURE_CREATED',
      entityType: 'SUBSCRIPTION_FEATURE',
      entityId: row.id,
      after: input,
    });
    return this.present(row);
  }
  async adminReport() {
    const plans = await this.persistence.collections.subscriptionPlan.count({
      where: { companyId: null, status: 'PUBLISHED' },
    });
    const companies = await this.persistence.companyIds();
    const totals = { active: 0, trials: 0, grace: 0, suspended: 0, pendingChanges: 0 };
    for (const c of companies) {
      const companyId = Number(c.id);
      const counts = await this.tenant(companyId, async (tx) => ({
        active: await this.persistence.collections.tenantSubscription.count({
          where: { companyId, status: 'ACTIVE' },
          transaction: tx,
        }),
        trials: await this.persistence.collections.tenantSubscription.count({
          where: { companyId, status: 'TRIALING' },
          transaction: tx,
        }),
        grace: await this.persistence.collections.tenantSubscription.count({
          where: { companyId, status: 'GRACE_PERIOD' },
          transaction: tx,
        }),
        suspended: await this.persistence.collections.tenantSubscription.count({
          where: { companyId, status: 'SUSPENDED' },
          transaction: tx,
        }),
        pendingChanges: await this.persistence.collections.subscriptionChangeRequest.count({
          where: { companyId, status: 'PENDING' },
          transaction: tx,
        }),
      }));
      for (const key of Object.keys(totals) as Array<keyof typeof totals>)
        totals[key] += Number(counts[key]);
    }
    return { plans, ...totals };
  }
  async listSubscriptions(status?: string, limit = 50) {
    const companies = await this.persistence.companyIds();
    const results: SubscriptionRecord[] = [];
    for (const c of companies) {
      const rows = await this.tenant(Number(c.id), (tx) =>
        this.persistence.collections.tenantSubscription.findAll({
          where: { companyId: Number(c.id), ...(status ? { status } : {}) },
          order: [['updatedAt', 'DESC']],
          limit: Math.min(100, limit),
          transaction: tx,
        }),
      );
      results.push(...rows);
    }
    return results
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, Math.min(100, limit))
      .map((r) => this.present(r));
  }
  async changeRequests(companyId: number, status?: string) {
    const rows = await this.tenant(companyId, (tx) =>
      this.persistence.collections.subscriptionChangeRequest.findAll({
        where: { companyId, ...(status ? { status } : {}) },
        order: [['createdAt', 'DESC']],
        limit: 100,
        transaction: tx,
      }),
    );
    return rows.map((r: any) => this.present(r));
  }
  async changeRequest(companyId: number, id: string) {
    return this.tenant(companyId, async (tx) =>
      this.present(
        await this.one(companyId, this.persistence.collections.subscriptionChangeRequest, id, tx),
      ),
    );
  }
  async adminChangeRequest(companyId: number, id: string) {
    return this.changeRequest(companyId, id);
  }
  async periods(companyId: number, id: string) {
    await this.tenant(companyId, (tx) =>
      this.one(companyId, this.persistence.collections.tenantSubscription, id, tx),
    );
    const rows = await this.tenant(companyId, (tx) =>
      this.persistence.collections.subscriptionPeriod.findAll({
        where: { companyId, runId: id },
        order: [['createdAt', 'DESC']],
        transaction: tx,
      }),
    );
    return rows.map((r: any) => this.present(r));
  }
  async alerts(companyId: number) {
    const rows = await this.tenant(companyId, (tx) =>
      this.persistence.collections.subscriptionNotification.findAll({
        where: { companyId, status: { [Op.in]: ['PENDING', 'UNREAD'] } },
        order: [['createdAt', 'DESC']],
        limit: 100,
        transaction: tx,
      }),
    );
    return rows.map((r: any) => this.present(r));
  }
  async requestRenewal(companyId: number, id: string, actor: number) {
    return this.tenant(companyId, async (tx) => {
      const sub = await this.one(
        companyId,
        this.persistence.collections.tenantSubscription,
        id,
        tx,
      );
      if (!['ACTIVE', 'GRACE_PERIOD'].includes(sub.status))
        throw fail('Subscrição não pode ser renovada neste estado.', 409);
      const invoiceRequestKey = `renewal-request:${sub.id}:${sub.data.currentPeriodEnd}`;
      const old = await this.persistence.collections.subscriptionOutbox.findOne({
        where: { companyId, key: invoiceRequestKey },
        transaction: tx,
      });
      if (old) return { status: 'REQUESTED', idempotent: true };
      await this.create(
        companyId,
        this.persistence.collections.subscriptionOutbox,
        {
          id: randomUUID(),
          status: 'PENDING',
          key: invoiceRequestKey,
          data: {
            event: 'platform-billing.invoice.requested',
            entityId: sub.id,
            tenantId: companyId,
            actorUserId: actor,
            subscriptionId: sub.id,
            planVersionId: sub.data.planVersionId,
            price: sub.data.price,
            interval: sub.data.interval,
            renewal: true,
            occurredAt: new Date().toISOString(),
          },
        },
        tx,
      );
      return { status: 'REQUESTED' };
    });
  }
  async convertTrial(
    companyId: number,
    actor: number,
    id: string,
    planVersionId: string,
    interval: BillingInterval,
  ) {
    return this.tenant(companyId, async (tx) => {
      const sub = await this.one(
        companyId,
        this.persistence.collections.tenantSubscription,
        id,
        tx,
      );
      if (sub.status !== 'TRIALING') throw fail('A subscrição não está em avaliação.', 409);
      const version = await this.persistence.collections.subscriptionPlanVersion.findOne({
        where: { companyId: null, id: planVersionId, status: 'PUBLISHED' },
        transaction: tx,
      });
      if (!version) throw fail('Plano comercial não publicado.', 404);
      const prices = await this.persistence.collections.subscriptionPlanPrice.findAll({
        where: { companyId: null, runId: planVersionId, status: 'ACTIVE' },
        transaction: tx,
      });
      const price = prices.find((row: any) => row.data.interval === interval);
      const now = new Date();
      if (!price || Number(price.data.amount) === 0) {
        const end = addInterval(now, interval, version.data.customDays);
        await this.persistence.update(
          sub,
          {
            status: 'ACTIVE',
            data: {
              ...sub.data,
              planId: version.runId,
              planVersionId,
              interval,
              currentPeriodStart: now.toISOString(),
              currentPeriodEnd: end.toISOString(),
              convertedAt: now.toISOString(),
              convertedBy: actor,
              price: price?.data || { currency: 'AOA', amount: '0.00' },
            },
          },
          { transaction: tx },
        );
        const trial = await this.persistence.collections.subscriptionTrial.findOne({
          where: { companyId, runId: id, status: 'ACTIVE' },
          transaction: tx,
        });
        if (trial)
          await this.persistence.update(trial, { status: 'CONVERTED' }, { transaction: tx });
        await this.startPeriod(companyId, sub, now, end, 'COMMERCIAL', tx);
        await this.rebuildEntitlements(companyId, sub, version, tx);
        await this.transition(companyId, sub, 'TRIALING', 'ACTIVE', 'TRIAL_CONVERTED', actor, tx);
        return this.present(sub);
      }
      await this.persistence.update(
        sub,
        {
          status: 'PENDING_PAYMENT',
          data: {
            ...sub.data,
            pendingPlanVersionId: planVersionId,
            pendingInterval: interval,
            convertedBy: actor,
            convertedAt: now.toISOString(),
            price: price.data,
          },
        },
        { transaction: tx },
      );
      await this.emit(
        companyId,
        'platform-billing.invoice.requested',
        sub.id,
        {
          tenantId: companyId,
          subscriptionId: id,
          planVersionId,
          price: price.data,
          interval,
          trialConversion: true,
        },
        tx,
      );
      return this.present(sub);
    });
  }
  async extendTrial(companyId: number, actor: number, id: string, days: number, reason: string) {
    if (!Number.isInteger(days) || days < 1 || days > 60)
      throw fail('A extensão deve ter de 1 a 60 dias.');
    return this.tenant(companyId, async (tx) => {
      const sub = await this.one(
        companyId,
        this.persistence.collections.tenantSubscription,
        id,
        tx,
      );
      if (sub.status !== 'TRIALING')
        throw fail('Apenas avaliações activas podem ser estendidas.', 409);
      const trial = await this.persistence.collections.subscriptionTrial.findOne({
        where: { companyId, runId: id, status: 'ACTIVE' },
        transaction: tx,
        forUpdate: true,
      });
      if (!trial) throw fail('Avaliação activa não encontrada.', 404);
      const end = new Date(new Date(trial.data.endsAt).getTime() + days * 86400000);
      await this.persistence.update(
        trial,
        {
          data: {
            ...trial.data,
            endsAt: end.toISOString(),
            extendedBy: actor,
            extensionDays: Number(trial.data.extensionDays || 0) + days,
            extensionReason: reason,
          },
        },
        { transaction: tx },
      );
      await this.persistence.update(
        sub,
        { data: { ...sub.data, currentPeriodEnd: end.toISOString() } },
        { transaction: tx },
      );
      await this.emit(
        companyId,
        'subscriptions.trial.extended',
        id,
        { days, endsAt: end.toISOString() },
        tx,
      );
      return this.present(trial);
    });
  }
  async applyBillingEvent(input: {
    eventId: string;
    type: string;
    companyId: number;
    subscriptionId: string;
    invoiceId?: string;
    reason?: string;
  }) {
    if (!input.eventId || !input.companyId || !input.subscriptionId)
      throw fail('Evento de cobrança incompleto.');
    return this.tenant(input.companyId, async (tx) => {
      const seen = await this.persistence.collections.subscriptionOutbox.findOne({
        where: { companyId: input.companyId, key: `billing-event:${input.eventId}` },
        transaction: tx,
      });
      if (seen) return { accepted: true, idempotent: true };
      if (input.type === 'platform-billing.payment.confirmed' && input.invoiceId) {
        const invoice = await this.persistence.collections.subscriptionOutbox.findOne({
          where: { companyId: input.companyId, key: `billing-invoice:${input.invoiceId}` },
          transaction: tx,
        });
        if (invoice) return { accepted: true, idempotent: true };
      }
      const sub = await this.one(
        input.companyId,
        this.persistence.collections.tenantSubscription,
        input.subscriptionId,
        tx,
      );
      if (input.type === 'platform-billing.payment.confirmed') {
        if (['PENDING_PAYMENT', 'GRACE_PERIOD', 'ACTIVE', 'TRIALING'].includes(sub.status)) {
          const now = new Date(),
            interval = (sub.data.pendingInterval || sub.data.interval) as BillingInterval,
            start = new Date(
              sub.data.pendingPlanVersionId
                ? now
                : sub.data.currentPeriodEnd > now.toISOString()
                  ? sub.data.currentPeriodEnd
                  : now,
            ),
            end = addInterval(start, interval);
          const from = sub.status,
            pendingChangeId = sub.data.pendingChangeRequestId,
            versionId = sub.data.pendingPlanVersionId || sub.data.planVersionId;
          await this.persistence.update(
            sub,
            {
              status: 'ACTIVE',
              data: {
                ...sub.data,
                planVersionId: versionId,
                planId:
                  (
                    await this.persistence.collections.subscriptionPlanVersion.findOne({
                      where: { companyId: null, id: versionId },
                      transaction: tx,
                    })
                  )?.runId || sub.data.planId,
                interval,
                currentPeriodStart: start.toISOString(),
                currentPeriodEnd: end.toISOString(),
                graceEndsAt: null,
                lastInvoiceId: input.invoiceId,
                paidAt: now.toISOString(),
                pendingPlanVersionId: null,
                pendingInterval: null,
              },
            },
            { transaction: tx },
          );
          await this.startPeriod(input.companyId, sub, start, end, 'COMMERCIAL', tx);
          const v = await this.persistence.collections.subscriptionPlanVersion.findOne({
            where: { companyId: null, id: versionId },
            transaction: tx,
          });
          if (v) await this.rebuildEntitlements(input.companyId, sub, v, tx);
          const trial = await this.persistence.collections.subscriptionTrial.findOne({
            where: { companyId: input.companyId, runId: sub.id, status: 'ACTIVE' },
            transaction: tx,
          });
          if (trial)
            await this.persistence.update(trial, { status: 'CONVERTED' }, { transaction: tx });
          if (pendingChangeId) {
            const change = await this.one(
              input.companyId,
              this.persistence.collections.subscriptionChangeRequest,
              pendingChangeId,
              tx,
            );
            await this.persistence.update(
              change,
              {
                status: 'APPLIED',
                data: { ...change.data, appliedAt: now.toISOString(), invoiceId: input.invoiceId },
              },
              { transaction: tx },
            );
            await this.emit(
              input.companyId,
              'subscriptions.change.applied',
              change.id,
              { subscriptionId: sub.id, planVersionId: versionId, invoiceId: input.invoiceId },
              tx,
            );
            await this.persistence.update(
              sub,
              { data: { ...sub.data, pendingChangeRequestId: null } },
              { transaction: tx },
            );
          }
          await this.transition(input.companyId, sub, from, 'ACTIVE', 'PAYMENT_CONFIRMED', 0, tx);
          await this.emit(
            input.companyId,
            'subscriptions.subscription.renewed',
            sub.id,
            { invoiceId: input.invoiceId, periodEnd: end.toISOString() },
            tx,
          );
        }
      } else if (
        input.type === 'platform-billing.payment.failed' ||
        input.type === 'platform-billing.invoice.overdue'
      ) {
        const policy = await this.policy(input.companyId),
          from = sub.status,
          graceEnds = new Date(Date.now() + Number(policy.graceDays || 7) * 86400000);
        await this.persistence.update(
          sub,
          {
            status: 'GRACE_PERIOD',
            data: {
              ...sub.data,
              graceEndsAt: graceEnds.toISOString(),
              billingFailureReason: input.reason || input.type,
            },
          },
          { transaction: tx },
        );
        await this.transition(input.companyId, sub, from, 'GRACE_PERIOD', input.type, 0, tx);
        await this.emit(
          input.companyId,
          'subscriptions.grace-period.started',
          sub.id,
          { graceEndsAt: graceEnds.toISOString() },
          tx,
        );
      }
      await this.create(
        input.companyId,
        this.persistence.collections.subscriptionOutbox,
        {
          id: randomUUID(),
          status: 'RECEIVED',
          key: `billing-event:${input.eventId}`,
          data: { ...input, receivedAt: new Date().toISOString() },
        },
        tx,
      );
      if (input.invoiceId && input.type === 'platform-billing.payment.confirmed')
        await this.create(
          input.companyId,
          this.persistence.collections.subscriptionOutbox,
          {
            id: randomUUID(),
            status: 'RECEIVED',
            key: `billing-invoice:${input.invoiceId}`,
            data: { invoiceId: input.invoiceId, subscriptionId: sub.id, eventId: input.eventId },
          },
          tx,
        );
      return { accepted: true };
    });
  }
  async runLifecycle(companyId: number) {
    return this.tenant(companyId, async (tx) => {
      const policy = await this.policy(companyId);
      const rows = await this.persistence.collections.tenantSubscription.findAll({
        where: { companyId, status: { [Op.in]: ['TRIALING', 'ACTIVE', 'GRACE_PERIOD'] } },
        transaction: tx,
        forUpdate: true,
      });
      let expired = 0,
        suspended = 0,
        renewals = 0;
      for (const sub of rows) {
        const now = new Date();
        if (sub.status === 'TRIALING' && new Date(sub.data.currentPeriodEnd) <= now) {
          await this.persistence.update(sub, { status: 'EXPIRED' }, { transaction: tx });
          await this.transition(companyId, sub, 'TRIALING', 'EXPIRED', 'TRIAL_EXPIRED', 0, tx);
          await this.emit(companyId, 'subscriptions.trial.expired', sub.id, {}, tx);
          const trial = await this.persistence.collections.subscriptionTrial.findOne({
            where: { companyId, runId: sub.id, status: 'ACTIVE' },
            transaction: tx,
          });
          if (trial)
            await this.persistence.update(trial, { status: 'EXPIRED' }, { transaction: tx });
          expired++;
        } else if (
          sub.status === 'TRIALING' &&
          !sub.data.trialExpiringAt &&
          new Date(sub.data.currentPeriodEnd).getTime() - now.getTime() <=
            Number(policy.renewalNoticeDays || 7) * 86400000
        ) {
          await this.persistence.update(
            sub,
            { data: { ...sub.data, trialExpiringAt: now.toISOString() } },
            { transaction: tx },
          );
          await this.create(
            companyId,
            this.persistence.collections.subscriptionNotification,
            {
              id: randomUUID(),
              status: 'PENDING',
              runId: sub.id,
              key: `trial-expiring:${sub.id}`,
              data: {
                subscriptionId: sub.id,
                type: 'TRIAL_EXPIRING',
                endsAt: sub.data.currentPeriodEnd,
                createdAt: now.toISOString(),
              },
            },
            tx,
          );
          await this.emit(
            companyId,
            'subscriptions.trial.expiring',
            sub.id,
            { endsAt: sub.data.currentPeriodEnd },
            tx,
          );
        } else if (
          sub.status === 'GRACE_PERIOD' &&
          sub.data.graceEndsAt &&
          new Date(sub.data.graceEndsAt) <= now
        ) {
          await this.persistence.update(sub, { status: 'SUSPENDED' }, { transaction: tx });
          await this.transition(
            companyId,
            sub,
            'GRACE_PERIOD',
            'SUSPENDED',
            'GRACE_PERIOD_ENDED',
            0,
            tx,
          );
          await this.emit(companyId, 'subscriptions.grace-period.ended', sub.id, {}, tx);
          suspended++;
        } else if (sub.data.cancelAtPeriodEnd && new Date(sub.data.currentPeriodEnd) <= now) {
          await this.persistence.update(
            sub,
            { status: 'CANCELLED', data: { ...sub.data, cancelledAt: now.toISOString() } },
            { transaction: tx },
          );
          await this.transition(
            companyId,
            sub,
            sub.status,
            'CANCELLED',
            'CANCEL_AT_PERIOD_END',
            0,
            tx,
          );
        } else if (
          sub.status === 'ACTIVE' &&
          new Date(sub.data.currentPeriodEnd) <= now &&
          !sub.data.cancelAtPeriodEnd
        ) {
          const graceEnds = new Date(now.getTime() + Number(policy.graceDays || 7) * 86400000);
          await this.persistence.update(
            sub,
            {
              status: 'GRACE_PERIOD',
              data: {
                ...sub.data,
                graceEndsAt: graceEnds.toISOString(),
                billingFailureReason: 'RENEWAL_UNCONFIRMED',
              },
            },
            { transaction: tx },
          );
          await this.transition(
            companyId,
            sub,
            'ACTIVE',
            'GRACE_PERIOD',
            'RENEWAL_UNCONFIRMED',
            0,
            tx,
          );
          await this.emit(
            companyId,
            'subscriptions.grace-period.started',
            sub.id,
            { graceEndsAt: graceEnds.toISOString(), reason: 'RENEWAL_UNCONFIRMED' },
            tx,
          );
          suspended++;
        } else if (
          sub.status === 'ACTIVE' &&
          new Date(sub.data.currentPeriodEnd).getTime() - now.getTime() <=
            Number(policy.renewalNoticeDays || 30) * 86400000 &&
          !sub.data.renewalRequestedAt
        ) {
          const key = `renewal-request:${sub.id}:${sub.data.currentPeriodEnd}`;
          const old = await this.persistence.collections.subscriptionOutbox.findOne({
            where: { companyId, key },
            transaction: tx,
          });
          if (!old)
            await this.create(
              companyId,
              this.persistence.collections.subscriptionOutbox,
              {
                id: randomUUID(),
                status: 'PENDING',
                key,
                data: {
                  event: 'platform-billing.invoice.requested',
                  entityId: sub.id,
                  subscriptionId: sub.id,
                  tenantId: companyId,
                  planVersionId: sub.data.planVersionId,
                  price: sub.data.price,
                  interval: sub.data.interval,
                  renewal: true,
                  occurredAt: now.toISOString(),
                },
              },
              tx,
            );
          await this.persistence.update(
            sub,
            { data: { ...sub.data, renewalRequestedAt: now.toISOString() } },
            { transaction: tx },
          );
          renewals++;
        }
      }
      const reservations = await this.persistence.collections.subscriptionUsageReservation.findAll({
        where: { companyId, status: 'RESERVED' },
        transaction: tx,
        forUpdate: true,
      });
      for (const r of reservations) {
        if (!r.data.expiresAt || new Date(r.data.expiresAt) > new Date()) continue;
        const account = await this.one(
            companyId,
            this.persistence.collections.subscriptionUsageAccount,
            r.runId!,
            tx,
          ),
          qty = Number(r.data.quantity);
        await this.persistence.update(
          account,
          {
            data: {
              ...account.data,
              reserved: String(Math.max(0, Number(account.data.reserved) - qty)),
            },
          },
          { transaction: tx },
        );
        await this.persistence.update(
          r,
          {
            status: 'RELEASED',
            data: {
              ...r.data,
              releasedAt: new Date().toISOString(),
              releaseReason: 'RESERVATION_EXPIRED',
            },
          },
          { transaction: tx },
        );
      }
      return {
        expired,
        suspended,
        renewals,
        expiredReservations: reservations.filter((r) => r.status === 'RELEASED').length,
        graceDays: policy.graceDays,
      };
    });
  }
}
