import { createHash, randomUUID } from 'crypto';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import {
  RecordStoreContext,
  RecordFilter as Op,
} from '../../../../shared/application/ports/record-store.port';
import {
  addBusinessHours,
  canTransitionTicket,
  SupportPriority,
  SupportTicketStatus,
  SupportTicketType,
  SupportVisibility,
  ticketNumber,
} from '../../domain/support-ticket';
import {
  SupportDocumentPort,
  SupportEntitlementPort,
  SupportNotificationPort,
  SupportRecord,
  SupportStorePort,
} from '../ports/support-ports';

export interface SupportRecordView {
  id: string;
  companyId: number | null;
  kind: string;
  key: string;
  status: string;
  userId: number | null;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}

const fail = (message: string, statusCode = 422) =>
  Object.assign(new Error(message), { statusCode });
const terminal = ['CLOSED', 'CANCELLED'];

export class SupportApplicationService {
  constructor(
    private readonly store: SupportStorePort,
    private readonly audit: AuditRecorderPort,
    private readonly entitlements: SupportEntitlementPort,
    private readonly notifications: SupportNotificationPort,
    private readonly documents: SupportDocumentPort,
  ) {}

  private scope(companyId: number | null) {
    return companyId === null ? 'platform' : `tenant:${companyId}`;
  }

  private async tx<T>(companyId: number | null, fn: (tx: RecordStoreContext) => Promise<T>) {
    return this.store.transaction(companyId, fn);
  }

  private create(
    companyId: number | null,
    kind: string,
    key: string,
    status: string,
    data: Record<string, unknown>,
    tx: RecordStoreContext,
    userId: number | null = null,
  ) {
    const now = new Date();
    return this.store.create(
      {
        id: randomUUID(),
        companyId,
        scopeKey: this.scope(companyId),
        kind,
        key,
        status,
        userId,
        data,
        createdAt: now,
        updatedAt: now,
      },
      { transaction: tx },
    );
  }

  private async one(companyId: number | null, kind: string, id: string, tx: RecordStoreContext) {
    const row = await this.store.findOne({ where: { companyId, kind, id }, transaction: tx });
    if (!row)
      throw fail(
        kind === 'TICKET' ? 'Ticket não encontrado.' : 'Registo de suporte não encontrado.',
        404,
      );
    return row;
  }

  private async auditEvent(
    companyId: number | null,
    actor: number | null,
    action: string,
    entityType: string,
    entityId: string,
    before?: Record<string, unknown>,
    after?: Record<string, unknown>,
  ) {
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: `support.${action}`,
      entityType,
      entityId,
      before,
      after,
    });
  }

  async createTicket(
    companyId: number,
    requesterId: number,
    input: {
      type: SupportTicketType;
      categoryCode: string;
      subject: string;
      description: string;
      affectedModule?: string;
      attachments?: string[];
      idempotencyKey: string;
      priority?: SupportPriority;
      audience?: 'COMPANY' | 'PLATFORM';
    },
  ) {
    const entitlement = await this.entitlements.getSupportEntitlements({
      tenantId: String(companyId),
      at: new Date(),
    });
    const audience = input.audience ?? 'COMPANY';
    const policyPrefix = audience === 'PLATFORM' ? 'platform:' : '';
    if (audience === 'PLATFORM' && input.attachments?.length)
      throw fail('Use authorized document sharing for platform support.', 403);
    if (!entitlement.supportEnabled) throw fail('O plano não inclui suporte activo.', 403);
    for (const documentId of input.attachments || [])
      await this.documents.assertAvailable({ tenantId: String(companyId), documentId });

    const result = await this.tx(companyId, async (tx) => {
      const old = await this.store.findOne({
        where: { companyId, kind: 'TICKET', key: input.idempotencyKey },
        transaction: tx,
      });
      if (old) {
        if (old.userId !== requesterId || old.data.requestFingerprint !== this.fingerprint(input))
          throw fail('Chave idempotente reutilizada com conteúdo diferente.', 409);
        return { row: old, created: false };
      }

      const activeTickets = await this.store.findAll({
        where: { companyId, kind: 'TICKET', userId: requesterId },
        limit: 500,
        transaction: tx,
      });
      const normalizedSubject = input.subject.trim().toLocaleLowerCase();
      const duplicate = activeTickets.find(
        (row) =>
          !terminal.includes(row.status) &&
          row.data.categoryCode === input.categoryCode &&
          String(row.data.subject).trim().toLocaleLowerCase() === normalizedSubject,
      );
      if (duplicate)
        throw fail(`Pedido possivelmente duplicado: ${String(duplicate.data.ticketNumber)}.`, 409);

      let counter = await this.store.findOne({
        where: { companyId, kind: 'SEQUENCE', key: String(new Date().getUTCFullYear()) },
        transaction: tx,
        forUpdate: true,
      });
      const sequence = Number(counter?.data.value || 0) + 1;
      if (counter)
        await this.store.update(counter, { data: { value: sequence } }, { transaction: tx });
      else
        counter = await this.create(
          companyId,
          'SEQUENCE',
          String(new Date().getUTCFullYear()),
          'ACTIVE',
          { value: sequence },
          tx,
        );

      const now = new Date();
      const policy =
        (await this.store.findOne({
          where: {
            companyId,
            kind: 'SLA_POLICY',
            key: { [Op.like]: `${policyPrefix}${entitlement.slaPolicyCode}:%` },
            status: 'ACTIVE',
          },
          transaction: tx,
        })) ||
        (await this.store.findOne({
          where: {
            companyId,
            kind: 'SLA_POLICY',
            key: { [Op.like]: `${policyPrefix}DEFAULT:%` },
            status: 'ACTIVE',
          },
          transaction: tx,
        })) ||
        (await this.store.findOne({
          where: {
            companyId: null,
            kind: 'SLA_POLICY',
            key: { [Op.like]: 'DEFAULT:%' },
            status: 'ACTIVE',
          },
          transaction: tx,
        }));
      const firstResponseHours = Number(policy?.data.firstResponseHours || 24);
      const resolutionHours = Number(policy?.data.resolutionHours || 120);
      const businessDays = Array.isArray(policy?.data.businessDays)
        ? policy.data.businessDays.map(Number)
        : [1, 2, 3, 4, 5];
      const holidays = Array.isArray(policy?.data.holidays) ? policy.data.holidays.map(String) : [];
      const businessStartHour = Number(policy?.data.businessStartHour ?? 9);
      const businessEndHour = Number(policy?.data.businessEndHour ?? 17);
      const row = await this.create(
        companyId,
        'TICKET',
        input.idempotencyKey,
        'OPEN',
        {
          ticketNumber: ticketNumber(sequence),
          requesterId, audience,
          type: input.type,
          categoryCode: input.categoryCode,
          subject: input.subject.trim(),
          description: input.description.trim(),
          affectedModule: input.affectedModule || null,
          attachmentIds: input.attachments || [],
          priority: input.priority || 'NORMAL',
          teamId: null,
          agentId: null,
          resolution: null,
          version: 1,
          requestFingerprint: this.fingerprint(input),
          sla: {
            policyId: policy?.id || null,
            policyCode: policy?.data.code || entitlement.slaPolicyCode,
            policyVersion: policy?.data.version || 1,
            firstResponseDeadline: addBusinessHours(
              now,
              firstResponseHours,
              businessDays,
              holidays,
              businessStartHour,
              businessEndHour,
            ).toISOString(),
            resolutionDeadline: addBusinessHours(
              now,
              resolutionHours,
              businessDays,
              holidays,
              businessStartHour,
              businessEndHour,
            ).toISOString(),
            firstRespondedAt: null,
            firstResponseBreachedAt: null,
            resolutionBreachedAt: null,
          },
        },
        tx,
        requesterId,
      );
      await this.create(
        companyId,
        'HISTORY',
        `${row.id}:created`,
        'RECORDED',
        {
          ticketId: row.id,
          actorId: requesterId,
          action: 'CREATED', audience,
          to: 'OPEN',
          at: now.toISOString(),
        },
        tx,
        requesterId,
      );
      return { row, created: true };
    });

    if (result.created) {
      await this.auditEvent(
        companyId,
        requesterId,
        'ticket.created',
        'support_ticket',
        result.row.id,
      );
      await this.notifications.notifyTicketCreated({
        tenantId: String(companyId),
        ticketId: result.row.id,
        recipientUserIds: [String(requesterId)],
        idempotencyKey: `${input.idempotencyKey}:created`,
      });
    }
    return this.present(result.row);
  }

  private fingerprint(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  async listTickets(
    companyId: number,
    actor: number,
    options: { ownOnly: boolean; platform?: boolean; status?: string; priority?: string; type?: string; queue?: string; page: number; limit: number },
  ) {
    return this.tx(companyId, async (tx) => {
      const queues: Record<string, string[]> = {
        active: ['OPEN', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_INTERNAL', 'WAITING_EXTERNAL', 'ESCALATED'],
        pending: ['WAITING_CUSTOMER', 'WAITING_INTERNAL', 'WAITING_EXTERNAL'],
        assigned: ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'],
        resolved: ['RESOLVED', 'CLOSED'],
      };
      const queue = options.queue ? queues[options.queue] : undefined;
      const statuses = options.status && queue ? queue.filter(status => status === options.status) : queue;
      if (statuses?.length === 0) return { page: options.page, limit: options.limit, total: 0, data: [] };
      const where = {
        companyId, kind: 'TICKET',
        ...(options.ownOnly ? { userId: actor } : {}),
        ...(options.platform ? { 'data.audience': 'PLATFORM' } : {}),
        ...(options.priority ? { 'data.priority': options.priority } : {}),
        ...(options.type ? { 'data.type': options.type } : {}),
        ...(statuses ? { status: { [Op.in]: statuses } } : options.status ? { status: options.status } : {}),
      };
      const total = Number(await this.store.count({ where, transaction: tx }));
      const rows = await this.store.findAll({
        where, order: [['createdAt', 'DESC'], ['id', 'DESC']],
        limit: options.limit, offset: (options.page - 1) * options.limit, transaction: tx,
      });
      return { page: options.page, limit: options.limit, total, data: rows.map(row => this.present(row)) };
    });
  }

  async assertPlatformTicket(companyId: number, id: string) {
    const ticket = await this.tx(companyId, tx => this.one(companyId, 'TICKET', id, tx));
    if (ticket.data.audience !== 'PLATFORM') throw fail('Ticket não encontrado.', 404);
  }

  async getTicket(companyId: number, actor: number, id: string, agent = false, includeInternal = agent, platform = false) {
    return this.tx(companyId, async (tx) => {
      const ticket = await this.one(companyId, 'TICKET', id, tx);
      this.assertTicketAccess(ticket, actor, agent);
      const messages = await this.store.findAll({
        where: { companyId, kind: 'MESSAGE', key: { [Op.like]: `${id}:%` } },
        order: [['createdAt', 'ASC']],
        limit: 500,
        transaction: tx,
      });
      return {
        ...this.present(ticket),
        messages: messages
          .filter(message => message.data.visibility === 'PUBLIC' || (includeInternal && this.isWorkspace(message, platform)))
          .map((message) => this.present(message)),
      };
    });
  }

  private assertTicketAccess(ticket: SupportRecord, actor: number, agent: boolean) {
    if (!agent && ticket.userId !== actor) throw fail('Ticket não encontrado.', 404);
  }

  async updateTicket(
    companyId: number,
    actor: number,
    id: string,
    patch: { subject?: string; categoryCode?: string; affectedModule?: string | null },
  ) {
    return this.tx(companyId, async (tx) => {
      const ticket = await this.one(companyId, 'TICKET', id, tx);
      if (terminal.includes(ticket.status))
        throw fail('Ticket encerrado não pode ser alterado.', 409);
      const before = { subject: ticket.data.subject, categoryCode: ticket.data.categoryCode };
      await this.store.update(
        ticket,
        {
          data: { ...ticket.data, ...patch, version: Number(ticket.data.version) + 1 },
        },
        { transaction: tx },
      );
      await this.history(companyId, tx, ticket, actor, 'UPDATED', before, patch);
      return this.present(ticket);
    });
  }

  async assignTicket(
    companyId: number,
    actor: number,
    id: string,
    input: { agentId?: number; teamId?: string; automatic?: boolean },
    platform = false,
    eligibleAgent?: (agent: number) => Promise<boolean>,
  ) {
    if (!input.automatic && !input.teamId && input.agentId === undefined) throw fail('Seleccione agente ou equipa.');
    return this.tx(companyId, async (tx) => {
      const ticket = await this.one(companyId, 'TICKET', id, tx);
      if (terminal.includes(ticket.status))
        throw fail('Ticket encerrado não pode ser atribuído.', 409);
      let { agentId } = input;
      if (input.automatic) {
        const agents = await this.store.findAll({
          where: { companyId, kind: 'AGENT', status: 'AVAILABLE' },
          limit: 500,
          transaction: tx,
        });
        const eligible = agents.filter(agent => this.isWorkspace(agent, platform));
        if (!eligible.length) throw fail('Não existem agentes disponíveis.', 409);
        const tickets = await this.store.findAll({
          where: {
            companyId,
            kind: 'TICKET',
            status: { [Op.notIn]: ['CLOSED', 'CANCELLED', 'RESOLVED'] },
          },
          limit: 2000,
          transaction: tx,
        });
        const workloads = eligible.map((agent) => ({
          id: Number(agent.data.userId),
          load: tickets.filter(
            (ticket) => Number(ticket.data.agentId) === Number(agent.data.userId),
          ).length,
        }));
        const ranked = workloads.sort((a, b) => a.load - b.load || a.id - b.id);
        for (const candidate of ranked) {
          if (!eligibleAgent || await eligibleAgent(candidate.id)) { agentId = candidate.id; break; }
        }
        if (agentId === undefined) throw fail('Não existem agentes autorizados disponíveis.', 409);
      }
      if (agentId !== undefined) {
        const agent = await this.store.findOne({
          where: { companyId, kind: 'AGENT', key: (platform ? 'platform:' : '') + agentId, status: 'AVAILABLE' },
          transaction: tx,
        });
        if (!agent || !this.isWorkspace(agent, platform)) throw fail('Agente indisponível ou não autorizado.', 403);
      }
      if (input.teamId) {
        const team = await this.store.findOne({
          where: { companyId, kind: 'TEAM', id: input.teamId, status: 'ACTIVE' },
          transaction: tx,
        });
        if (!team || !this.isWorkspace(team, platform)) throw fail('Equipa não encontrada ou inactiva.', 404);
      }
      const before = { agentId: ticket.data.agentId, teamId: ticket.data.teamId };
      const status = ticket.status === 'OPEN' ? 'ASSIGNED' : ticket.status;
      await this.store.update(
        ticket,
        {
          status,
          data: {
            ...ticket.data,
            agentId: agentId ?? null,
            teamId: input.teamId ?? ticket.data.teamId,
            version: Number(ticket.data.version) + 1,
          },
        },
        { transaction: tx },
      );
      await this.history(companyId, tx, ticket, actor, 'ASSIGNED', before, {
        agentId,
        teamId: input.teamId,
      });
      return this.present(ticket);
    });
  }

  async transferTicket(companyId: number, actor: number, id: string, teamId: string, platform = false) {
    const result = await this.tx(companyId, async (tx) => {
      const ticket = await this.one(companyId, 'TICKET', id, tx);
      if (terminal.includes(ticket.status))
        throw fail('Ticket encerrado não pode ser transferido.', 409);
      const team = await this.store.findOne({
        where: { companyId, kind: 'TEAM', id: teamId, status: 'ACTIVE' },
        transaction: tx,
      });
      if (!team || !this.isWorkspace(team, platform)) throw fail('Equipa não encontrada ou inactiva.', 404);
      const previous = { teamId: ticket.data.teamId, agentId: ticket.data.agentId };
      await this.store.update(
        ticket,
        {
          data: { ...ticket.data, teamId, agentId: null, version: Number(ticket.data.version) + 1 },
        },
        { transaction: tx },
      );
      await this.history(companyId, tx, ticket, actor, 'TRANSFERRED', previous, { teamId });
      return ticket;
    });
    await this.auditEvent(companyId, actor, 'ticket.transferred', 'support_ticket', id);
    return this.present(result);
  }

  async changePriority(companyId: number, actor: number, id: string, priority: SupportPriority) {
    return this.tx(companyId, async (tx) => {
      const ticket = await this.one(companyId, 'TICKET', id, tx);
      if (terminal.includes(ticket.status))
        throw fail('Ticket encerrado não pode ter prioridade alterada.', 409);
      const previous = ticket.data.priority;
      if (previous === priority) return this.present(ticket);
      const sla = ticket.data.sla as Record<string, unknown>;
      const policy = sla.policyId
        ? await this.store.findOne({
            where: { companyId, kind: 'SLA_POLICY', id: sla.policyId },
            transaction: tx,
          })
        : null;
      const priorityHours = policy?.data.priorityResolutionHours as
        | Record<string, unknown>
        | undefined;
      const newResolutionHours = Number(priorityHours?.[priority]);
      const businessDays = Array.isArray(policy?.data.businessDays)
        ? policy.data.businessDays.map(Number)
        : [1, 2, 3, 4, 5];
      const holidays = Array.isArray(policy?.data.holidays) ? policy.data.holidays.map(String) : [];
      const startHour = Number(policy?.data.businessStartHour ?? 9);
      const endHour = Number(policy?.data.businessEndHour ?? 17);
      const updatedSla =
        Number.isFinite(newResolutionHours) && newResolutionHours > 0
          ? {
              ...sla,
              resolutionDeadline: addBusinessHours(
                new Date(String(ticket.createdAt)),
                newResolutionHours,
                businessDays,
                holidays,
                startHour,
                endHour,
              ).toISOString(),
            }
          : sla;
      await this.store.update(
        ticket,
        {
          data: {
            ...ticket.data,
            priority,
            sla: updatedSla,
            version: Number(ticket.data.version) + 1,
          },
        },
        { transaction: tx },
      );
      await this.create(
        companyId,
        'PRIORITY_HISTORY',
        `${id}:${randomUUID()}`,
        'RECORDED',
        {
          ticketId: id,
          actorId: actor,
          from: previous,
          to: priority,
          at: new Date().toISOString(),
        },
        tx,
        actor,
      );
      await this.history(
        companyId,
        tx,
        ticket,
        actor,
        'PRIORITY_CHANGED',
        { priority: previous },
        { priority },
      );
      return this.present(ticket);
    });
  }

  async transition(
    companyId: number,
    actor: number,
    id: string,
    to: SupportTicketStatus,
    resolution?: string,
  ) {
    const result = await this.tx(companyId, async (tx) => {
      const ticket = await this.one(companyId, 'TICKET', id, tx);
      const from = ticket.status as SupportTicketStatus;
      if (!canTransitionTicket(from, to))
        throw fail(`Transição ${from} para ${to} não permitida.`, 409);
      if (to === 'RESOLVED' && !resolution?.trim()) throw fail('A resolução é obrigatória.');
      await this.store.update(
        ticket,
        {
          status: to,
          data: {
            ...ticket.data,
            ...(to === 'RESOLVED'
              ? { resolution: resolution!.trim(), resolvedAt: new Date().toISOString() }
              : {}),
            ...(to === 'OPEN' && from !== 'OPEN' ? { reopenedAt: new Date().toISOString() } : {}),
            version: Number(ticket.data.version) + 1,
          },
        },
        { transaction: tx },
      );
      await this.history(
        companyId,
        tx,
        ticket,
        actor,
        'STATUS_CHANGED',
        { status: from },
        { status: to, resolution },
      );
      return ticket;
    });
    await this.auditEvent(companyId, actor, `ticket.${to.toLowerCase()}`, 'support_ticket', id);
    await this.notifications.notifyTicketUpdated({
      tenantId: String(companyId),
      ticketId: id,
      recipientUserIds: [String(result.userId)],
      idempotencyKey: `${id}:${to}:${String(result.data.version)}`,
    });
    return this.present(result);
  }

  async addMessage(
    companyId: number,
    actor: number,
    id: string,
    input: {
      body: string;
      visibility: SupportVisibility;
      attachmentIds?: string[];
      idempotencyKey: string;
    },
    agent: boolean,
    platform = false,
  ) {
    if (input.visibility === 'INTERNAL' && !agent)
      throw fail('Apenas agentes podem criar notas internas.', 403);
    for (const documentId of input.attachmentIds || [])
      await this.documents.assertAvailable({ tenantId: String(companyId), documentId });
    const result = await this.tx(companyId, async (tx) => {
      const ticket = await this.one(companyId, 'TICKET', id, tx);
      this.assertTicketAccess(ticket, actor, agent);
      if (terminal.includes(ticket.status))
        throw fail('Não é possível responder a um ticket encerrado.', 409);
      const key = `${id}:${input.idempotencyKey}`;
      const old = await this.store.findOne({
        where: { companyId, kind: 'MESSAGE', key },
        transaction: tx,
      });
      if (old) {
        if (old.data.authorId !== actor || old.data.fingerprint !== this.fingerprint(input))
          throw fail('Chave idempotente reutilizada com conteúdo diferente.', 409);
        return old;
      }
      const now = new Date().toISOString();
      const message = await this.create(
        companyId,
        'MESSAGE',
        key,
        'RECORDED',
        {
          ticketId: id,
          authorId: actor,
          visibility: input.visibility,
          workspace: platform ? 'PLATFORM' : 'COMPANY',
          body: input.body.trim(),
          attachmentIds: input.attachmentIds || [],
          createdAt: now,
          fingerprint: this.fingerprint(input),
        },
        tx,
        actor,
      );
      const currentSla = ticket.data.sla as Record<string, unknown>;
      if (agent && input.visibility === 'PUBLIC' && !currentSla.firstRespondedAt) {
        await this.store.update(
          ticket,
          {
            data: {
              ...ticket.data,
              sla: { ...currentSla, firstRespondedAt: now },
              version: Number(ticket.data.version) + 1,
            },
          },
          { transaction: tx },
        );
      }
      await this.history(
        companyId,
        tx,
        ticket,
        actor,
        input.visibility === 'INTERNAL' ? 'INTERNAL_NOTE' : 'MESSAGE',
        {},
        { messageId: message.id },
        platform,
      );
      return message;
    });
    await this.auditEvent(
      companyId,
      actor,
      input.visibility === 'INTERNAL' ? 'internal-note.created' : 'message.created',
      'support_message',
      result.id,
    );
    if (input.visibility === 'PUBLIC') {
      const ticket = await this.tx(companyId, (tx) => this.one(companyId, 'TICKET', id, tx));
      await this.notifications.notifyTicketUpdated({
        tenantId: String(companyId),
        ticketId: id,
        recipientUserIds: [String(ticket.userId)],
        idempotencyKey: `${id}:message:${result.id}`,
      });
    }
    return this.present(result);
  }

  async historyForTicket(companyId: number, actor: number, id: string, agent: boolean, platform = false, includeInternal = agent) {
    return this.tx(companyId, async (tx) => {
      const ticket = await this.one(companyId, 'TICKET', id, tx);
      this.assertTicketAccess(ticket, actor, agent);
      const rows = await this.store.findAll({
        where: { companyId, kind: 'HISTORY', key: { [Op.like]: `${id}:%` } },
        order: [['createdAt', 'ASC']],
        limit: 500,
        transaction: tx,
      });
      return rows
        .filter(row => row.data.action !== 'INTERNAL_NOTE' || (includeInternal && this.isWorkspace(row, platform)))
        .map((row) => this.present(row));
    });
  }

  async slaForTicket(companyId: number, actor: number, id: string, agent: boolean) {
    const ticket = await this.tx(companyId, (tx) => this.one(companyId, 'TICKET', id, tx));
    this.assertTicketAccess(ticket, actor, agent);
    return ticket.data.sla;
  }

  async createPolicy(
    companyId: number,
    actor: number,
    input: {
      code: string;
      firstResponseHours: number;
      resolutionHours: number;
      businessDays?: number[];
      holidays?: string[];
      businessStartHour?: number;
      businessEndHour?: number;
      priorityResolutionHours?: Partial<Record<SupportPriority, number>>;
    },
    platform = false,
  ) {
    const code = (platform ? 'platform:' : '') + input.code;
    const version = await this.tx(companyId, async (tx) => {
      const rows = await this.store.findAll({
        where: { companyId, kind: 'SLA_POLICY', key: { [Op.like]: `${code}:%` } },
        transaction: tx,
      });
      const next = Math.max(0, ...rows.map((row) => Number(row.data.version || 0))) + 1;
      const policy = await this.create(
        companyId,
        'SLA_POLICY',
        `${code}:${next}`,
        'ACTIVE',
        {
          ...input,
          workspace: platform ? 'PLATFORM' : 'COMPANY',
          version: next,
          createdBy: actor,
        },
        tx,
        actor,
      );
      for (const row of rows)
        if (row.status === 'ACTIVE')
          await this.store.update(row, { status: 'SUPERSEDED' }, { transaction: tx });
      return policy;
    });
    await this.auditEvent(companyId, actor, 'sla-policy.created', 'support_sla_policy', version.id);
    return this.present(version);
  }

  async listPolicies(companyId: number, platform = false) {
    return this.listKind(companyId, 'SLA_POLICY', platform);
  }

  async slaSnapshot(companyId: number, platform = false) {
    return this.tx(companyId, async tx => {
      const rows = await this.store.findAll({ where: { companyId, kind: 'TICKET', ...(platform ? { 'data.audience': 'PLATFORM' } : {}) },
        order: [['createdAt', 'DESC']], limit: 2000, transaction: tx });
      const atRisk: SupportRecordView[] = [], breached: SupportRecordView[] = [];
      const now = Date.now();
      for (const row of rows) {
        const sla = row.data.sla as Record<string, unknown> | undefined;
        if (!sla) continue;
        const active = !['RESOLVED', ...terminal].includes(row.status);
        const deadlines = [!sla.firstRespondedAt && sla.firstResponseDeadline, sla.resolutionDeadline]
          .filter(Boolean).map(value => Date.parse(String(value)));
        if (sla.firstResponseBreachedAt || sla.resolutionBreachedAt || (active && deadlines.some(value => value <= now)))
          breached.push(this.present(row));
        else if (active && deadlines.some(value => value <= now + 3600000)) atRisk.push(this.present(row));
      }
      return { atRisk, breached };
    });
  }

  async slaMonitor(companyId: number, actor: number) {
    const now = Date.now();
    const result = await this.tx(companyId, async (tx) => {
      const rows = await this.store.findAll({
        where: { companyId, kind: 'TICKET' },
        limit: 1000,
        transaction: tx,
      });
      const risk: SupportRecord[] = [];
      const breached: SupportRecord[] = [];
      for (const row of rows) {
        const sla = row.data.sla as Record<string, unknown>;
        if (!sla || ['RESOLVED', 'CLOSED', 'CANCELLED'].includes(row.status)) continue;
        const deadlines = [
          {
            type: 'FIRST_RESPONSE',
            value: sla.firstResponseDeadline,
            done: Boolean(sla.firstRespondedAt),
            breachedAt: sla.firstResponseBreachedAt,
          },
          {
            type: 'RESOLUTION',
            value: sla.resolutionDeadline,
            done: false,
            breachedAt: sla.resolutionBreachedAt,
          },
        ];
        let updatedSla = { ...sla };
        for (const clock of deadlines) {
          const deadline = new Date(String(clock.value)).getTime();
          if (clock.done) continue;
          if (deadline < now && !clock.breachedAt) {
            const at = new Date().toISOString();
            updatedSla = {
              ...updatedSla,
              [clock.type === 'FIRST_RESPONSE'
                ? 'firstResponseBreachedAt'
                : 'resolutionBreachedAt']: at,
            };
            await this.create(
              companyId,
              'SLA_EVENT',
              `${row.id}:${clock.type.toLowerCase()}-breached`,
              'RECORDED',
              {
                ticketId: row.id,
                type: `${clock.type}_BREACHED`,
                at,
              },
              tx,
            );
            breached.push(row);
          } else if (deadline < now + 60 * 60 * 1000 && !clock.breachedAt) risk.push(row);
        }
        if (updatedSla !== sla)
          await this.store.update(
            row,
            { data: { ...row.data, sla: updatedSla } },
            { transaction: tx },
          );
      }
      return {
        atRisk: risk.map((row) => this.present(row)),
        breached: breached.map((row) => this.present(row)),
      };
    });
    for (const ticket of result.breached) {
      if (actor)
        await this.auditEvent(companyId, actor, 'sla.breached', 'support_ticket', ticket.id);
      await this.notifications.notifyTicketUpdated({
        tenantId: String(companyId),
        ticketId: ticket.id,
        recipientUserIds: [String(ticket.userId)],
        idempotencyKey: `${ticket.id}:sla-breached`,
      });
    }
    return result;
  }

  async createResource(
    companyId: number | null,
    actor: number,
    kind: string,
    input: Record<string, unknown>,
  ) {
    const identifier =
      kind === 'ARTICLE'
        ? input.slug
        : kind === 'INCIDENT'
          ? input.code || randomUUID()
          : input.code || input.name;
    if (typeof identifier !== 'string' || !identifier.trim())
      throw fail('Código ou nome obrigatório.');
    const code = (companyId && input.workspace === 'PLATFORM' ? 'platform:' : '') + identifier.trim();
    const row = await this.tx(companyId, async (tx) => {
      const old = await this.store.findOne({
        where: { companyId, kind, key: code },
        transaction: tx,
      });
      if (old) throw fail('Este recurso já existe.', 409);
      return this.create(
        companyId,
        kind,
        code,
        String(input.status || 'ACTIVE'),
        { ...input, createdBy: actor },
        tx,
        actor,
      );
    });
    await this.auditEvent(
      companyId,
      actor,
      `${kind.toLowerCase()}.created`,
      kind.toLowerCase(),
      row.id,
    );
    return this.present(row);
  }

  private isWorkspace(row: SupportRecord, platform: boolean) {
    return (row.data.workspace === 'PLATFORM') === platform;
  }

  async listKind(companyId: number | null, kind: string, platform = false, includePublished = false) {
    const operational = ['HISTORY', 'ESCALATION', 'SURVEY'].includes(kind);
    const scope = !companyId || !platform ? {} : operational ? { 'data.audience': 'PLATFORM' } : { 'data.workspace': 'PLATFORM' };
    return this.tx(companyId, async tx => {
      const rows = await this.store.findAll({ where: { companyId, kind, ...scope },
        order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 500, transaction: tx });
      return rows.filter(row => !companyId ||
        (operational ? row.data.action !== 'INTERNAL_NOTE' || this.isWorkspace(row, platform)
          : includePublished || this.isWorkspace(row, platform))).map(row => this.present(row));
    });
  }

  async createIncident(companyId: number | null, actor: number, input: Record<string, unknown>) {
    return this.createResource(companyId, actor, 'INCIDENT', {
      ...input,
      severity: input.severity || 'MAJOR',
      status: 'OPEN',
      startedAt: new Date().toISOString(),
      updates: [],
    });
  }

  async escalateTicket(companyId: number, actor: number, id: string, reason: string) {
    const result = await this.tx(companyId, async (tx) => {
      const ticket = await this.one(companyId, 'TICKET', id, tx);
      if (terminal.includes(ticket.status) || ticket.status === 'RESOLVED')
        throw fail('Ticket concluído não pode ser escalado.', 409);
      const count = await this.store.count({
        where: { companyId, kind: 'ESCALATION', key: { [Op.like]: `${id}:%` } },
        transaction: tx,
      });
      const level = Number(count) + 1;
      const escalation = await this.create(
        companyId,
        'ESCALATION',
        `${id}:${level}`,
        'ACTIVE',
        {
          ticketId: id, audience: ticket.data.audience,
          level,
          reason,
          createdBy: actor,
          createdAt: new Date().toISOString(),
        },
        tx,
        actor,
      );
      const previousStatus = ticket.status;
      await this.store.update(
        ticket,
        {
          status: 'ESCALATED',
          data: {
            ...ticket.data,
            escalationLevel: level,
            version: Number(ticket.data.version) + 1,
          },
        },
        { transaction: tx },
      );
      await this.history(
        companyId,
        tx,
        ticket,
        actor,
        'ESCALATED',
        { status: previousStatus },
        { level, reason },
      );
      return { escalation, ticket };
    });
    await this.auditEvent(companyId, actor, 'ticket.escalated', 'support_ticket', id);
    await this.notifications.notifyTicketUpdated({
      tenantId: String(companyId),
      ticketId: id,
      recipientUserIds: [String(result.ticket.userId)],
      idempotencyKey: `${id}:escalation:${result.escalation.id}`,
    });
    return this.present(result.escalation);
  }

  async updateIncident(
    companyId: number | null,
    actor: number,
    id: string,
    input: Record<string, unknown>,
    platform = false,
  ) {
    const row = await this.tx(companyId, async (tx) => {
      const incident = await this.one(companyId, 'INCIDENT', id, tx);
      if (companyId && !this.isWorkspace(incident, platform)) throw fail('Incidente não encontrado.', 404);
      const updates: unknown[] = Array.isArray(incident.data.updates) ? incident.data.updates : [];
      await this.store.update(
        incident,
        {
          status: String(input.status || incident.status),
          data: {
            ...incident.data,
            ...input,
            updates: [
              ...updates,
              { actorId: actor, at: new Date().toISOString(), message: input.message || null },
            ],
          },
        },
        { transaction: tx },
      );
      return incident;
    });
    await this.auditEvent(companyId, actor, 'incident.updated', 'support_incident', id);
    return this.present(row);
  }

  async linkTicketIncident(companyId: number, actor: number, ticketId: string, incidentId: string, platform = false) {
    return this.tx(companyId, async (tx) => {
      const ticket = await this.one(companyId, 'TICKET', ticketId, tx);
      const incident = await this.one(companyId, 'INCIDENT', incidentId, tx);
      if (ticket.companyId !== incident.companyId || !this.isWorkspace(incident, platform))
        throw fail('Âmbitos do incidente e ticket incompatíveis.', 403);
      const linked: unknown[] = [
        ...(Array.isArray(incident.data.ticketIds) ? (incident.data.ticketIds as unknown[]) : []),
      ];
      if (!linked.includes(ticketId)) linked.push(ticketId);
      await this.store.update(
        incident,
        { data: { ...incident.data, ticketIds: linked } },
        { transaction: tx },
      );
      await this.history(companyId, tx, ticket, actor, 'INCIDENT_LINKED', {}, { incidentId });
      return this.present(incident);
    });
  }

  async createArticle(
    companyId: number | null,
    actor: number,
    input: {
      slug: string;
      title: string;
      content: string;
      visibility: 'PUBLIC' | 'TENANT' | 'INTERNAL';
      category?: string;
      workspace?: string;
    },
  ) {
    return this.createResource(companyId, actor, 'ARTICLE', {
      ...input,
      version: 1,
      status: 'DRAFT',
      versions: [{ version: 1, content: input.content, createdAt: new Date().toISOString() }],
    });
  }

  async updateArticle(
    companyId: number | null,
    actor: number,
    id: string,
    patch: { title?: string; content?: string; visibility?: string; category?: string },
    platform = false,
  ) {
    return this.tx(companyId, async (tx) => {
      const article = await this.one(companyId, 'ARTICLE', id, tx);
      if (companyId && !this.isWorkspace(article, platform)) throw fail('Artigo não encontrado.', 404);
      if (article.status === 'ARCHIVED') throw fail('Artigo arquivado.', 409);
      const version = Number(article.data.version || 1) + 1;
      const versions: unknown[] = Array.isArray(article.data.versions) ? article.data.versions : [];
      await this.store.update(
        article,
        {
          status: platform ? 'DRAFT' : article.status,
          data: {
            ...article.data,
            ...patch,
            version,
            versions: [
              ...versions,
              {
                version,
                content: patch.content ?? article.data.content,
                createdAt: new Date().toISOString(),
                actor,
              },
            ],
          },
        },
        { transaction: tx },
      );
      return this.present(article);
    });
  }

  async publishArticle(companyId: number | null, actor: number, id: string, platform = false) {
    const article = await this.tx(companyId, async (tx) => {
      const row = await this.one(companyId, 'ARTICLE', id, tx);
      if (companyId && !this.isWorkspace(row, platform)) throw fail('Artigo não encontrado.', 404);
      if (row.status !== 'DRAFT') throw fail('Apenas rascunhos podem ser publicados.', 409);
      await this.store.update(
        row,
        {
          status: 'PUBLISHED',
          data: { ...row.data, publishedAt: new Date().toISOString(), publishedBy: actor,
            publishedSnapshot: { title: row.data.title, content: row.data.content, visibility: row.data.visibility,
              category: row.data.category, version: row.data.version } },
        },
        { transaction: tx },
      );
      return row;
    });
    await this.auditEvent(companyId, actor, 'knowledge.article-published', 'support_article', id);
    return this.present(article);
  }

  async searchArticles(companyId: number | null, query: string, internal = false, platform = false, drafts = false) {
    const own = await this.listKind(companyId, 'ARTICLE', platform, !internal);
    const shared = companyId && !internal ? await this.listKind(null, 'ARTICLE') : [];
    const rows = [...own, ...shared].flatMap(row => {
      if (internal) return [row];
      const snapshot = row.publishedSnapshot;
      const visible = row.status === 'DRAFT' && snapshot && typeof snapshot === 'object' ? { ...row, ...snapshot, status: 'PUBLISHED' } : row;
      if (visible.status !== 'PUBLISHED' || visible.visibility === 'INTERNAL' || (row.companyId === null && visible.visibility !== 'PUBLIC')) return [];
      const { versions: _versions, publishedSnapshot: _snapshot, ...result } = visible;
      return [result];
    });
    const needle = query.trim().toLocaleLowerCase();
    return rows.filter(
      (row) =>
        (drafts || row.status === 'PUBLISHED') &&
        (internal || row.visibility !== 'INTERNAL') &&
        `${String(row.title ?? '')} ${String(row.content ?? '')} ${String(row.category ?? '')}`
          .toLocaleLowerCase()
          .includes(needle),
    );
  }

  async rateTicket(
    companyId: number,
    actor: number,
    ticketId: string,
    rating: number,
    comment?: string,
  ) {
    return this.tx(companyId, async (tx) => {
      const ticket = await this.one(companyId, 'TICKET', ticketId, tx);
      this.assertTicketAccess(ticket, actor, false);
      if (!['RESOLVED', 'CLOSED'].includes(ticket.status))
        throw fail('Só é possível avaliar tickets resolvidos.', 409);
      const existing = await this.store.findOne({
        where: { companyId, kind: 'SURVEY', key: ticketId },
        transaction: tx,
      });
      if (existing) throw fail('Este ticket já foi avaliado.', 409);
      const survey = await this.create(
        companyId,
        'SURVEY',
        ticketId,
        'SUBMITTED',
        {
          ticketId, audience: ticket.data.audience,
          requesterId: actor,
          rating,
          comment: comment || null,
          submittedAt: new Date().toISOString(),
        },
        tx,
        actor,
      );
      return this.present(survey);
    });
  }

  async dashboard(companyId: number | null, platform = false) {
    const tickets = await this.tx(companyId, (tx) =>
      this.store.findAll({ where: { companyId, kind: 'TICKET', ...(platform ? { 'data.audience': 'PLATFORM' } : {}) },
        order: [['createdAt', 'DESC']], limit: 2000, transaction: tx }),
    );
    const today = new Date().toISOString().slice(0, 10);
    let responseTotal = 0, responseCount = 0, resolutionTotal = 0, resolutionCount = 0, breached = 0;
    for (const ticket of tickets) {
      const start = new Date(ticket.createdAt ?? '').getTime();
      const sla = ticket.data.sla as Record<string, unknown> | undefined;
      const response = Date.parse(String(sla?.firstRespondedAt ?? '')) - start;
      const resolution = Date.parse(String(ticket.data.resolvedAt ?? '')) - start;
      if (Number.isFinite(response) && response >= 0) { responseCount++; responseTotal += response; }
      if (Number.isFinite(resolution) && resolution >= 0) { resolutionCount++; resolutionTotal += resolution; }
      if (sla?.firstResponseBreachedAt || sla?.resolutionBreachedAt) breached++;
    }
    return {
      breached,
      averageResponseMinutes: responseCount ? Math.round(responseTotal / responseCount / 60000) : null,
      averageResolutionMinutes: resolutionCount ? Math.round(resolutionTotal / resolutionCount / 60000) : null,
      open: tickets.filter(
        (ticket) => !terminal.includes(ticket.status) && ticket.status !== 'RESOLVED',
      ).length,
      inProgress: tickets.filter((ticket) =>
        ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'].includes(ticket.status),
      ).length,
      resolvedToday: tickets.filter(
        (ticket) =>
          ['RESOLVED', 'CLOSED'].includes(ticket.status) && String(ticket.data.resolvedAt || '').startsWith(today),
      ).length,
      byPriority: Object.fromEntries(
        ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'].map((priority) => [
          priority,
          tickets.filter(
            (ticket) => ticket.data.priority === priority && !terminal.includes(ticket.status),
          ).length,
        ]),
      ),
      byStatus: Object.fromEntries(
        [...new Set(tickets.map((ticket) => ticket.status))].map((status) => [
          status,
          tickets.filter((ticket) => ticket.status === status).length,
        ]),
      ),
      satisfaction: await this.satisfaction(companyId, platform),
      sampled: tickets.length === 2000,
    };
  }

  async satisfaction(companyId: number | null, platform = false) {
    return this.tx(companyId, async (tx) => {
      const rows = await this.store.findAll({
        where: { companyId, kind: 'SURVEY', ...(platform ? { 'data.audience': 'PLATFORM' } : {}) },
        limit: 2000,
        transaction: tx,
      });
      const scores = rows.map((row) => Number(row.data.rating)).filter(Number.isFinite);
      return {
        responses: scores.length,
        average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0,
      };
    });
  }

  async auditEntries(companyId: number | null, platform = false) {
    return this.listKind(companyId, 'HISTORY', platform);
  }

  async updateAgent(companyId: number, actor: number, id: string, status: string, platform = false) {
    const row = await this.tx(companyId, async tx => {
      const agent = await this.one(companyId, 'AGENT', id, tx);
      if (!this.isWorkspace(agent, platform)) throw fail('Agente não encontrado.', 404);
      return this.store.update(agent, { status }, { transaction: tx });
    });
    await this.auditEvent(companyId, actor, 'agent.status-updated', 'support_agent', id, undefined, { status });
    return this.present(row);
  }

  async completeEscalation(companyId: number, actor: number, id: string, resolution: string, platform = false) {
    const row = await this.tx(companyId, async tx => {
      const escalation = await this.one(companyId, 'ESCALATION', id, tx);
      const ticket = await this.one(companyId, 'TICKET', String(escalation.data.ticketId), tx);
      if (platform && ticket.data.audience !== 'PLATFORM') throw fail('Escalonamento não encontrado.', 404);
      if (escalation.status !== 'ACTIVE') throw fail('Escalonamento já concluído.', 409);
      await this.history(companyId, tx, ticket, actor, 'ESCALATION_COMPLETED', {}, { escalationId: id }, platform);
      return this.store.update(escalation, { status: 'COMPLETED', data: { ...escalation.data, resolution, completedBy: actor } }, { transaction: tx });
    });
    await this.auditEvent(companyId, actor, 'escalation.completed', 'support_escalation', id);
    return this.present(row);
  }

  async sweep(companyId: number) {
    await this.slaMonitor(companyId, 0);
    const tickets = await this.tx(companyId, (tx) =>
      this.store.findAll({ where: { companyId, kind: 'TICKET' }, limit: 1000, transaction: tx }),
    );
    return tickets.length;
  }

  private async history(
    companyId: number,
    tx: RecordStoreContext,
    ticket: SupportRecord,
    actor: number,
    action: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    platform = false,
  ) {
    return this.create(
      companyId,
      'HISTORY',
      `${ticket.id}:${randomUUID()}`,
      'RECORDED',
      {
        ticketId: ticket.id,
        audience: ticket.data.audience,
        workspace: platform ? 'PLATFORM' : 'COMPANY',
        actorId: actor,
        action,
        before,
        after,
        at: new Date().toISOString(),
      },
      tx,
      actor,
    );
  }

  private present(row: SupportRecord): SupportRecordView {
    return {
      ...row.data,
      ...(row.kind === 'AGENT' ? { agentUserId: row.data.userId } : {}),
      id: row.id,
      companyId: row.companyId,
      kind: row.kind,
      key: row.key,
      status: row.status,
      userId: row.userId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
