import { randomUUID } from 'crypto';
import {
  OnboardingApplicationView as Application,
  OnboardingEventView as Event,
  OnboardingResourceView as Resource,
  ProvisionCheckpoint,
  WorkflowPolicy,
  provisionSteps,
} from '../ports/onboarding-store.port';
import { fail } from '../../domain/onboarding';
import { OnboardingResourcesService } from './onboarding-resources.service';

const open = ['DRAFT', 'IN_PROGRESS', 'ADDITIONAL_INFO', 'REJECTED'];
const terminal = ['COMPLETED', 'REJECTED', 'CANCELLED'];
const day = 86400000;
const remindable = ['DRAFT', 'IN_PROGRESS', 'ADDITIONAL_INFO', 'AWAITING_PAYMENT'];
const companyReviewStates = [...open, 'PENDING_REVIEW'];
const order: Array<[string, 'ASC' | 'DESC']> = [['createdAt', 'DESC'], ['id', 'DESC']];
const taxId = (value: unknown) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const whereDate = (from?: string, to?: string) => ({
  ...(from ? { $gte: new Date(from + 'T00:00:00.000Z') } : {}),
  ...(to ? { $lt: new Date(Date.parse(to + 'T00:00:00.000Z') + day) } : {}),
});
const tally = (items: string[]) => Object.entries(items.reduce<Record<string, number>>((counts, item) => {
  counts[item] = (counts[item] ?? 0) + 1;
  return counts;
}, Object.create(null))).map(([label, count]) => ({ label, count }));
const rowsIn = <T>(rows: T[], page: number, limit: number) =>
  ({ items: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit });

export type AdminFilters = {
  page: number; limit: number; search?: string; status?: string[]; mode?: string;
  owner?: number; assignee?: number; from?: string; to?: string;
  flag?: 'nif' | 'duplicates' | 'stalled' | 'company' | 'recoverable' | 'assisted';
};
export type AssistedInput = {
  operationKey: string; mode: string; source: string;
  company?: { name: string; taxId: string; email: string; address: string; phone?: string };
};

function summary(row: Application, counts?: Map<string, number>) {
  const company = row.data.steps?.company;
  const nif = taxId(company?.taxId);
  return {
    id: row.id, ownerId: row.ownerId, companyId: row.companyId, status: row.status,
    version: row.version, mode: String(row.data.mode ?? 'UNKNOWN'), source: row.data.source,
    companyName: company?.name, taxId: company?.taxId,
    assigneeId: row.data.assigneeId ?? null, planVersionId: row.data.steps?.plan?.planVersionId,
    duplicateCount: nif && counts ? Math.max(0, (counts.get(nif) ?? 0) - 1) : 0,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    recoverable: row.status === 'FAILED' ||
      (row.status === 'PROVISIONING' && Number(row.data.leaseUntil ?? 0) < Date.now()),
    stalled: !terminal.includes(row.status) &&
      Date.now() - new Date(row.updatedAt ?? 0).getTime() >= Number(row.data.policy?.inactivityDays ?? 7) * day,
  };
}

function eventSummary(row: Event) {
  const { actor, type, step, decision, reason, companyId, documentId, assigneeId, status } = row.data;
  return { id: row.id, applicationId: row.applicationId, createdAt: row.createdAt,
    actor, type, step, decision, reason, companyId, documentId, assigneeId, status };
}

function resourceSummary(row: Resource, application?: Application) {
  const { kind, data } = row;
  const result = { id: row.id, applicationId: row.applicationId,
    companyName: application?.data.steps?.company?.name, kind, status: row.status,
    createdAt: row.createdAt, updatedAt: row.updatedAt };
  if (kind === 'DOCUMENT') return {
    ...result, fileName: data.fileName, sizeBytes: data.sizeBytes, mimeType: data.mimeType,
    reviewedBy: data.reviewedBy, reason: data.reason, reviewedAt: data.reviewedAt,
  };
  if (kind === 'INVITATION') return {
    ...result, email: data.email, expiresAt: data.expiresAt, issuedBy: data.issuedBy,
    status: row.status === 'PENDING' && Number(data.expiresAt) <= Date.now() ? 'EXPIRED' : row.status,
  };
  if (kind === 'IMPORT') {
    const results: { index: number; success: boolean; error?: string }[] =
      Array.isArray(data.results) ? data.results : [];
    return {
      ...result, importKind: data.kind, total: Array.isArray(data.rows) ? data.rows.length : 0,
      succeeded: results.filter((item) => item.success).length,
      errors: results.filter((item) => !item.success).map((item) => ({
        row: item.index + 1,
        reason: item.error?.includes('Limite de trabalhadores excedido')
          ? 'Employee limit exceeded' : 'The record could not be imported',
      })),
    };
  }
  return result;
}

export class OnboardingAdminService extends OnboardingResourcesService {
  private taxIdCounts(rows: Application[]) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = taxId(row.data.steps?.company?.taxId);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  async directory(filter: AdminFilters) {
    const [rows, registered] = await Promise.all([
      this.persistence.applications.findAll({ order }),
      filter.flag === 'duplicates' ? this.resources.companyTaxRegistry() : [],
    ]);
    const counts = this.taxIdCounts(rows);
    const registeredByTaxId = new Map<string, number[]>();
    for (const company of registered) {
      const nif = taxId(company.taxId);
      const ids = registeredByTaxId.get(nif) ?? [];
      ids.push(company.id);
      registeredByTaxId.set(nif, ids);
    }
    const query = filter.search?.toLocaleLowerCase();
    const dates = whereDate(filter.from, filter.to);
    const result = rows.map((source) => {
      const row = summary(source, counts);
      row.duplicateCount += registeredByTaxId.get(taxId(row.taxId))?.filter((id) => id !== row.companyId).length ?? 0;
      return row;
    }).filter((row) => {
      if (filter.status?.length && !filter.status.includes(row.status)) return false;
      if (filter.mode && row.mode !== filter.mode) return false;
      if (filter.owner && row.ownerId !== filter.owner) return false;
      if (filter.assignee && row.assigneeId !== filter.assignee) return false;
      if (dates.$gte && (!row.createdAt || row.createdAt < dates.$gte)) return false;
      if (dates.$lt && (!row.createdAt || row.createdAt >= dates.$lt)) return false;
      if (query && ![row.id, row.companyName, row.taxId, row.source].some(value =>
        String(value ?? '').toLocaleLowerCase().includes(query))) return false;
      switch (filter.flag) {
        case 'nif': return !!row.taxId;
        case 'duplicates': return row.duplicateCount > 0;
        case 'stalled': return row.stalled;
        case 'company': return row.companyId !== null;
        case 'recoverable': return row.recoverable;
        case 'assisted': return row.mode !== 'SELF_SERVICE';
        default: return true;
      }
    });
    return rowsIn(result, filter.page, filter.limit);
  }

  async overview(from?: string, to?: string) {
    const where = from || to ? { createdAt: whereDate(from, to) } : {};
    const [cohort, documents, importFailures, importBatches] = await Promise.all([
      this.persistence.applications.findAll({ where, order }),
      this.persistence.resources.count({ where: { kind: 'DOCUMENT', status: 'CLEAN', ...where } }),
      this.persistence.resources.count({ where: { kind: 'IMPORT', status: 'PARTIALLY_COMPLETED', ...where } }),
      this.persistence.resources.count({ where: { kind: 'IMPORT', ...where } }),
    ]);
    const rows = cohort.map((row) => summary(row));
    const completed = cohort.filter((row) => row.status === 'COMPLETED');
    const durations = completed.flatMap((row) => {
      const duration = Number(new Date(row.data.completedAt ?? row.updatedAt ?? '')) - Number(new Date(row.createdAt ?? ''));
      return duration >= 0 ? [duration / day] : [];
    });
    const plans = new Map<string, { label: string; total: number; completed: number }>();
    for (const row of rows) {
      if (!row.planVersionId) continue;
      const item = plans.get(row.planVersionId) ?? { label: row.planVersionId, total: 0, completed: 0 };
      item.total++;
      if (row.status === 'COMPLETED') item.completed++;
      plans.set(item.label, item);
    }
    return {
      total: rows.length, completed: completed.length,
      pending: rows.filter((row) => row.status === 'PENDING_REVIEW').length,
      stalled: rows.filter((row) => row.stalled).length,
      failed: rows.filter((row) => row.status === 'FAILED').length,
      awaitingPayment: rows.filter((row) => row.status === 'AWAITING_PAYMENT').length,
      cancelled: rows.filter((row) => row.status === 'CANCELLED').length,
      documents: Number(documents), importFailures: Number(importFailures), importBatches: Number(importBatches),
      meanDays: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
      status: tally(rows.map((row) => row.status)),
      modes: tally(rows.map((row) => row.mode)),
      daily: tally(cohort.flatMap((row) => row.createdAt ? [new Date(row.createdAt).toISOString().slice(0, 10)] : [])).reverse(),
      assignees: tally(rows.flatMap((row) => row.assigneeId ? [String(row.assigneeId)] : [])),
      plans: [...plans.values()],
      recent: rows.slice(0, 6),
    };
  }

  async workspace(id: string, actor: number) {
    const row = await this.get(id, actor, true);
    const nif = taxId(row.data.steps?.company?.taxId);
    const readiness = await this.checkReadiness(row);
    const [resources, events, subscription, registered] = await Promise.all([
      this.persistence.resources.findAll({ where: { applicationId: id, kind: ['DOCUMENT', 'INVITATION', 'IMPORT'] }, order }),
      this.persistence.events.findAll({ where: { applicationId: id }, order }),
      row.companyId ? this.ports.subscription(row.companyId) : null,
      nif ? this.resources.companyTaxRegistry() : [],
    ]);
    const steps = row.data.steps ?? {};
    const duplicates = steps.company?.taxId
      ? (await this.persistence.applications.findAll({ order })).filter((other) =>
          other.id !== id && taxId(other.data.steps?.company?.taxId) === taxId(steps.company.taxId))
          .map((other) => summary(other)) : [];
    const plan = steps.plan;
    const approvalBlockers = [
      ...readiness.missing,
      ...(this.companyReviewPending(row) ? ['company-verification'] : []),
    ];
    const activationBlockers = [...approvalBlockers];
    if (!row.data.approvedBy || row.data.approvedBy === row.ownerId) activationBlockers.push('independent-approval');
    if (row.status === 'AWAITING_PAYMENT' && !['ACTIVE', 'TRIALING'].includes(subscription?.status))
      activationBlockers.push('subscription-payment');
    const provisioning = provisionSteps.map(step => {
      const checkpoint = row.data.executions?.[step] as ProvisionCheckpoint | undefined;
      return {
        step,
        status: checkpoint?.status ?? (row.status === 'COMPLETED' || step === 'tenant' && row.companyId ? 'COMPLETED' : 'PENDING'),
        attempts: checkpoint?.attempts ?? null,
        updatedAt: checkpoint?.updatedAt ?? null,
      };
    });
    return {
      application: summary(row), company: steps.company, organization: steps.organization,
      payroll: steps['payroll-settings'] ? {
        currency: steps['payroll-settings'].currency, payDay: steps['payroll-settings'].payDay,
        legalRuleSetId: steps['payroll-settings'].legalRuleSetId, effectiveFrom: steps['payroll-settings'].effectiveFrom,
        componentCount: steps['payroll-settings'].components?.length ?? 0,
      } : null,
      plan, subscriptionStatus: subscription?.status ?? null, approvalBlockers, activationBlockers, provisioning,
      workflowVersion: row.data.workflowVersion, termsVersion: row.data.termsVersion,
      requiredDocuments: Number(row.data.policy?.requiredDocuments ?? process.env.ONBOARDING_REQUIRED_DOCUMENTS ?? 0),
      companyVerification: row.data.companyVerification ?? null,
      canVerifyCompany: actor !== row.ownerId && !!steps.company && !row.companyId && companyReviewStates.includes(row.status),
      termsAcceptedAt: row.data.termsAcceptedBy === row.ownerId ? row.data.termsAcceptedAt : null,
      approvedBy: row.data.approvedBy, decisionReason: row.data.decisionReason,
      canInvite: open.includes(row.status) && !row.companyId && row.data.mode !== 'SELF_SERVICE' && !row.data.assistedClaimedAt,
      canRemind: remindable.includes(row.status) && !(row.data.createdBy && !row.data.assistedClaimedAt),
      canClose: [...open, 'PENDING_REVIEW', 'APPROVED', 'FAILED'].includes(row.status) && !row.companyId,
      registered: registered.filter((company) => company.id !== row.companyId && taxId(company.taxId) === nif)
        .map(({ id, name }) => ({ id, name })),
      duplicates, resources: resources.map((resource) => resourceSummary(resource, row)),
      events: events.map(eventSummary),
    };
  }

  async resourceDirectory(kind: string, page: number, limit: number, status?: string, importKind?: string) {
    // The stored PENDING status covers both active and expired invitations.
    const where = { kind, ...(status && kind !== 'INVITATION' ? { status } : {}) };
    if (kind === 'INVITATION' && status || kind === 'IMPORT' && importKind) {
      const rows = await this.persistence.resources.findAll({ where, order });
      const matching = rows.filter((row) => kind === 'INVITATION'
        ? resourceSummary(row).status === status : row.data.kind === importKind);
      const result = rowsIn(matching, page, limit);
      return { ...result, items: await this.presentResources(result.items) };
    }
    const [rows, count] = await Promise.all([
      this.persistence.resources.findAll({ where, order, offset: (page - 1) * limit, limit }),
      this.persistence.resources.count({ where }),
    ]);
    return { items: await this.presentResources(rows), total: Number(count), page, limit };
  }

  private async presentResources(rows: Resource[]) {
    const ids = [...new Set(rows.map((row) => row.applicationId))];
    const applications = ids.length ? await this.persistence.applications.findAll({ where: { id: ids } }) : [];
    const byId = new Map(applications.map((row) => [row.id, row]));
    return rows.map((row) => resourceSummary(row, byId.get(row.applicationId)));
  }

  async audit(page: number, limit: number, applicationId?: string, communications = false) {
    const where = { ...(applicationId ? { applicationId } : {}) };
    if (communications) {
      const relevant = new Set(['onboarding.invitation.created', 'onboarding.invitation.accepted', 'onboarding.invitation.revoked',
        'onboarding.reminder.requested', 'onboarding.reminder.queued']);
      const rows = await this.persistence.events.findAll({ where, order });
      return rowsIn(rows.filter((row) => relevant.has(row.data.type)).map(eventSummary), page, limit);
    }
    const [items, count] = await Promise.all([
      this.persistence.events.findAll({ where, order, limit, offset: (page - 1) * limit }),
      this.persistence.events.count({ where }),
    ]);
    return { items: items.map(eventSummary), total: Number(count), page, limit };
  }

  createAssisted(actor: number, input: AssistedInput) {
    return this.persistence.applications.transaction(null, async (tx) => {
      const existing = await this.persistence.applications.findOne({
        where: { operationKey: input.operationKey }, transaction: tx,
      });
      const request = JSON.stringify(input);
      if (existing) {
        if (existing.data.createdBy === actor && existing.data.request === request) return { id: existing.id };
        throw fail('Chave de idempotência reutilizada.', 409);
      }
      const policy = await this.currentPolicy(tx);
      const row = await this.persistence.applications.create({
        id: randomUUID(), ownerId: actor, operationKey: input.operationKey, status: 'DRAFT',
        companyId: null, version: 1, data: {
          mode: input.mode, source: input.source, request, createdBy: actor, assigneeId: actor,
          workflowVersion: policy.version, policy, steps: input.company ? { company: input.company } : {}, executions: {},
        },
      }, { transaction: tx });
      await this.event(row, actor, 'onboarding.assisted.created', tx);
      return { id: row.id };
    });
  }

  async assign(id: string, actor: number, assigneeId: number | null, reason: string) {
    if (assigneeId && !(await this.resources.assigneeAvailable(assigneeId)))
      throw fail('Responsável sem acesso à administração de adesões.', 422);
    return this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, true, tx);
      if (terminal.includes(row.status)) throw fail('Adesão encerrada.', 409);
      if (row.data.assigneeId === assigneeId) return;
      await this.persistence.applications.update(row, {
        version: row.version + 1, data: { ...row.data, assigneeId },
      }, { transaction: tx });
      await this.event(row, actor, 'onboarding.assignment.changed', tx, { assigneeId, reason });
    });
  }

  note(id: string, actor: number, reason: string) {
    return this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, true, tx);
      await this.event(row, actor, 'onboarding.note.recorded', tx, { reason });
    });
  }

  verifyCompany(id: string, actor: number, approved: boolean, reason: string, version: number) {
    return this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, true, tx);
      if (row.ownerId === actor) throw fail('A verificação exige outro utilizador.', 403);
      if (!row.data.steps?.company || row.companyId || !companyReviewStates.includes(row.status))
        throw fail('Dados empresariais indisponíveis para verificação.', 409);
      if (row.version !== version) throw fail('A adesão foi alterada; actualize a consulta.', 409);
      const decision = approved ? 'VERIFIED' : 'NEEDS_CORRECTION';
      const verification = { decision, actor, reason, reviewedAt: new Date().toISOString() };
      await this.persistence.applications.update(row, {
        version: row.version + 1, data: { ...row.data, companyVerification: verification },
      }, { transaction: tx });
      await this.event(row, actor, 'onboarding.company.verification', tx, { decision, reason });
      return verification;
    });
  }

  async retry(id: string, actor: number, reason: string) {
    const row = await this.get(id, actor, true);
    const result = await this.provision(id, row.ownerId, { actor, reason, action: 'retry' });
    return { status: result.status };
  }

  async activateFromAdmin(id: string, actor: number, reason: string) {
    const row = await this.get(id, actor, true);
    if (row.status === 'AWAITING_PAYMENT') {
      const subscription = row.companyId ? await this.ports.subscription(row.companyId) : null;
      if (!['ACTIVE', 'TRIALING'].includes(subscription?.status))
        throw fail('A subscrição ainda aguarda confirmação comercial.', 409);
    }
    const result = await this.provision(id, row.ownerId, { actor, reason, action: 'activate' });
    return { status: result.status };
  }

  revokeInvitation(id: string, actor: number, invitationId: string, reason: string) {
    return this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, true, tx);
      const invitation = await this.persistence.resources.findOne({
        where: { id: invitationId, applicationId: id, kind: 'INVITATION' }, transaction: tx, forUpdate: true,
      });
      if (!invitation) throw fail('Convite não encontrado.', 404);
      if (invitation.status === 'REVOKED') return { status: invitation.status };
      if (invitation.status !== 'PENDING' || Number(invitation.data.expiresAt) <= Date.now())
        throw fail('O convite já não está pendente.', 409);
      await this.persistence.resources.update(invitation, { status: 'REVOKED' }, { transaction: tx });
      await this.event(row, actor, 'onboarding.invitation.revoked', tx, { reason, status: 'REVOKED' });
      return { status: 'REVOKED' };
    });
  }

  close(id: string, actor: number, reason: string) {
    return this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, true, tx);
      if (row.companyId || ![...open, 'PENDING_REVIEW', 'APPROVED', 'FAILED'].includes(row.status))
        throw fail('A adesão não pode ser encerrada neste estado.', 409);
      await this.persistence.applications.update(row, { status: 'CANCELLED' }, { transaction: tx });
      await this.event(row, actor, 'onboarding.application.cancelled', tx, { reason });
      return { status: row.status };
    });
  }

  async remind(id: string, actor: number, reason: string) {
    const key = 'onboarding:' + id + ':manual-reminder:' + new Date().toISOString().slice(0, 10);
    const pending = await this.persistence.applications.transaction(null, async (tx) => {
      const row = await this.access(id, actor, true, tx);
      if (!remindable.includes(row.status) || (row.data.createdBy && !row.data.assistedClaimedAt))
        throw fail('A adesão não está disponível para lembretes.', 409);
      const where = { applicationId: id, kind: 'REMINDER', key };
      const existing = await this.persistence.resources.findOne({ where, transaction: tx });
      if (existing) return existing;
      const result = await this.persistence.resources.create({
        ...where, id: randomUUID(), status: 'PENDING', data: { ownerId: row.ownerId, status: row.status },
      }, { transaction: tx });
      await this.event(row, actor, 'onboarding.reminder.requested', tx, { reason, status: row.status });
      return result;
    });
    if (pending.status === 'PENDING') {
      await this.resources.notify(pending.data.ownerId, key, pending.data.status);
      await this.persistence.applications.transaction(null, async (tx) => {
        const row = await this.access(id, actor, true, tx);
        const changed = await this.persistence.resources.updateWhere({ status: 'QUEUED' }, {
          where: { id: pending.id, status: 'PENDING' }, transaction: tx,
        });
        if (changed) await this.event(row, actor, 'onboarding.reminder.queued', tx, { status: pending.data.status });
      });
    }
    return { status: 'QUEUED' };
  }

  async policy() {
    const [current, history] = await Promise.all([
      this.currentPolicy(),
      this.persistence.policies.findAll({ order: [['version', 'DESC']], limit: 50 }),
    ]);
    return { current, history, administrativeRole: 'SUPER_ADMIN' };
  }

  publishPolicy(actorId: number, expectedVersion: number, data: Omit<WorkflowPolicy, 'version'>, reason: string) {
    return this.persistence.applications.transaction(null, async (tx) => {
      const current = await this.currentPolicy(tx);
      if (current.version !== expectedVersion) throw fail('A política foi alterada; actualize a consulta.', 409);
      const version = current.version + 1;
      const policy = {
        ...data,
        companyVerificationModes: data.companyVerificationModes ?? current.companyVerificationModes ?? [],
        organizationRequiredModes: data.organizationRequiredModes ?? current.organizationRequiredModes ?? [],
      };
      await this.persistence.policies.create({ id: randomUUID(), version, actorId, data: policy, reason }, { transaction: tx });
      return { ...policy, version };
    });
  }
}

