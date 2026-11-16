import { Request, Response } from 'express';
import { SubscriptionsApplicationService } from '../../application/use-cases/subscriptions-application.service';
import {
  billingEventSchema,
  cancelSchema,
  changeSchema,
  createSubscriptionSchema,
  decisionSchema,
  idSchema,
  overrideSchema,
  planSchema,
  policySchema,
  trialConversionSchema,
} from '../schemas/subscriptions.schema';
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsApplicationService) {}
  private context(req: Request, res: Response) {
    const companyId = res.req.tenant?.companyId,
      actorUserId = req.user?.userId;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Contexto da empresa obrigatório.' });
      return null;
    }
    if (!actorUserId) {
      res.status(401).json({ success: false, message: 'Autenticação obrigatória.' });
      return null;
    }
    return { companyId, actorUserId };
  }
  async plans(_req: Request, res: Response) {
    res.json({ success: true, data: await this.service.listPlans(true) });
  }
  async current(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({ success: true, data: await this.service.current(c.companyId) });
  }
  async createSubscription(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(201).json({
      success: true,
      data: await this.service.createSubscription(
        c.companyId,
        c.actorUserId,
        createSubscriptionSchema.parse(req.body),
      ),
    });
  }
  async cancel(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const input = cancelSchema.parse(req.body);
    res.json({
      success: true,
      data: await this.service.cancel(
        c.companyId,
        c.actorUserId,
        req.params.id,
        input.atPeriodEnd,
        input.reason,
      ),
    });
  }
  async reactivate(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.service.reactivate(c.companyId, c.actorUserId, req.params.id),
    });
  }
  async renewal(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.status(202).json({
      success: true,
      data: await this.service.requestRenewal(c.companyId, req.params.id, c.actorUserId),
    });
  }
  async convertTrial(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const body = trialConversionSchema.parse(req.body);
    res.status(202).json({
      success: true,
      data: await this.service.convertTrial(
        c.companyId,
        c.actorUserId,
        req.params.id,
        body.planVersionId,
        body.interval,
      ),
    });
  }
  async periods(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({ success: true, data: await this.service.periods(c.companyId, req.params.id) });
  }
  async history(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({ success: true, data: await this.service.history(c.companyId, req.params.id) });
  }
  async changes(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    if (req.method === 'POST')
      res.status(201).json({
        success: true,
        data: await this.service.requestChange(
          c.companyId,
          c.actorUserId,
          changeSchema.parse(req.body),
        ),
      });
    else
      res.json({
        success: true,
        data: await this.service.changeRequests(
          c.companyId,
          typeof req.query.status === 'string' ? req.query.status : undefined,
        ),
      });
  }
  async change(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({ success: true, data: await this.service.changeRequest(c.companyId, req.params.id) });
  }
  async entitlements(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const version = await this.service.current(c.companyId);
    if (!version) {
      res.json({ success: true, data: { features: [], version: 'none' } });
      return;
    }
    const plan = version.planVersion || {};
    res.json({
      success: true,
      data: {
        features: plan.features || {},
        limits: plan.limits || {},
        entitlementVersion: `${plan.version || version.planVersionId}:${version.planVersionId}`,
      },
    });
  }
  async feature(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.service.checkFeature(c.companyId, String(req.params.featureCode)),
    });
  }
  async limit(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({
      success: true,
      data: await this.service.getLimit(c.companyId, String(req.params.metricCode)),
    });
  }
  async usage(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    const metric =
      typeof req.params.metricCode === 'string'
        ? req.params.metricCode
        : typeof req.query.metricCode === 'string'
          ? req.query.metricCode
          : undefined;
    res.json({ success: true, data: await this.service.usage(c.companyId, metric) });
  }
  async alerts(req: Request, res: Response) {
    const c = this.context(req, res);
    if (!c) return;
    res.json({ success: true, data: await this.service.alerts(c.companyId) });
  }
  async adminPlans(req: Request, res: Response) {
    if (req.method === 'POST')
      res.status(201).json({
        success: true,
        data: await this.service.createPlan(Number(req.user?.userId), planSchema.parse(req.body)),
      });
    else res.json({ success: true, data: await this.service.listPlans(false) });
  }
  async adminFeatures(req: Request, res: Response) {
    if (req.method === 'POST') {
      const body = zodObject(req.body);
      res.status(201).json({
        success: true,
        data: await this.service.createFeature(Number(req.user?.userId), {
          code: String(body.code || ''),
          name: String(body.name || ''),
          description: body.description ? String(body.description) : undefined,
        }),
      });
    } else res.json({ success: true, data: await this.service.features() });
  }
  async adminPlan(req: Request, res: Response) {
    const id = idSchema.parse(req.params.id);
    if (req.method === 'PATCH')
      res.json({
        success: true,
        data: await this.service.updatePlan(
          Number(req.user?.userId),
          id,
          planSchema.partial().parse(req.body),
        ),
      });
    else res.json({ success: true, data: await this.service.plan(id) });
  }
  async createPlanVersion(req: Request, res: Response) {
    res.status(201).json({
      success: true,
      data: await this.service.createPlanVersion(
        Number(req.user?.userId),
        idSchema.parse(req.params.id),
        planSchema.parse(req.body),
      ),
    });
  }
  async publishPlan(req: Request, res: Response) {
    const body = zodObject(req.body);
    res.json({
      success: true,
      data: await this.service.publishPlan(
        Number(req.user?.userId),
        idSchema.parse(req.params.id),
        idSchema.parse(body.versionId),
      ),
    });
  }
  async archivePlan(req: Request, res: Response) {
    res.json({
      success: true,
      data: await this.service.archivePlan(Number(req.user?.userId), idSchema.parse(req.params.id)),
    });
  }
  async comparePlans(req: Request, res: Response) {
    res.json({
      success: true,
      data: await this.service.comparePlans(
        Array.isArray(req.query.ids)
          ? req.query.ids.map(String)
          : String(req.query.ids || '')
              .split(',')
              .filter(Boolean),
      ),
    });
  }
  async adminChanges(req: Request, res: Response, approve: boolean) {
    const { reason } = decisionSchema.parse(req.body || {});
    const companyId = Number(req.params.tenantId);
    if (!Number.isSafeInteger(companyId) || companyId <= 0) {
      res.status(400).json({ success: false, message: 'Tenant inválido.' });
      return;
    }
    res.json({
      success: true,
      data: await this.service.decideChange(
        companyId,
        Number(req.user?.userId),
        idSchema.parse(req.params.id),
        approve,
        reason,
      ),
    });
  }
  async adminSubscription(req: Request, res: Response) {
    const tenantId = Number(req.params.tenantId);
    if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
      res.status(400).json({ success: false, message: 'Tenant inválido.' });
      return;
    }
    res.json({ success: true, data: await this.service.platformSubscription(tenantId) });
  }
  async adminChangeDetail(req: Request, res: Response) {
    const companyId = Number(req.params.tenantId);
    if (!Number.isSafeInteger(companyId) || companyId <= 0) {
      res.status(400).json({ success: false, message: 'Tenant inválido.' });
      return;
    }
    res.json({
      success: true,
      data: await this.service.adminChangeRequest(companyId, idSchema.parse(req.params.id)),
    });
  }
  async adminStatus(req: Request, res: Response, status: 'SUSPENDED' | 'ACTIVE') {
    const tenantId = Number(req.params.tenantId);
    if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
      res.status(400).json({ success: false, message: 'Tenant inválido.' });
      return;
    }
    res.json({
      success: true,
      data: await this.service.setStatus(
        tenantId,
        Number(req.user?.userId),
        status,
        decisionSchema.parse(req.body || {}).reason || status,
      ),
    });
  }
  async adminOverride(req: Request, res: Response) {
    const tenantId = Number(req.params.tenantId);
    if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
      res.status(400).json({ success: false, message: 'Tenant inválido.' });
      return;
    }
    res.status(201).json({
      success: true,
      data: await this.service.createOverride(
        tenantId,
        Number(req.user?.userId),
        overrideSchema.parse(req.body),
      ),
    });
  }
  async report(_req: Request, res: Response) {
    res.json({ success: true, data: await this.service.adminReport() });
  }
  async policy(req: Request, res: Response) {
    if (req.method === 'PUT')
      res.json({
        success: true,
        data: await this.service.updatePolicy(
          Number(req.user?.userId),
          policySchema.parse(req.body),
        ),
      });
    else res.json({ success: true, data: await this.service.policy() });
  }
  async adminList(req: Request, res: Response) {
    res.json({
      success: true,
      data: await this.service.listSubscriptions(
        typeof req.query.status === 'string' ? req.query.status : undefined,
        Number(req.query.limit) || 50,
      ),
    });
  }
  async adminTrialExtend(req: Request, res: Response) {
    const input = zodObject(req.body);
    const companyId = Number(req.params.tenantId);
    res.json({
      success: true,
      data: await this.service.extendTrial(
        companyId,
        Number(req.user?.userId),
        idSchema.parse(input.subscriptionId),
        Number(input.days),
        String(input.reason || ''),
      ),
    });
  }
  async billingEvent(req: Request, res: Response) {
    const token = process.env.SUBSCRIPTIONS_BILLING_EVENTS_TOKEN;
    if (!token || req.header('Authorization') !== `Bearer ${token}`) {
      res.status(401).json({ success: false, message: 'Integração de cobrança não autorizada.' });
      return;
    }
    res.json({
      success: true,
      data: await this.service.applyBillingEvent(billingEventSchema.parse(req.body)),
    });
  }
}
function zodObject(value: any): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Object.assign(new Error('Corpo JSON obrigatório.'), { statusCode: 400 });
  return value;
}
