import {
  NotificationKind,
  NotificationDataMap,
  notificationKindSchema,
} from '../dto/notification-data';
import { NotificationRecord } from '../ports/notification-store.port';
import { createHash, randomUUID } from 'crypto';
import {
  NotificationStorePort,
  RecordStoreContext,
  RecordFilter as Op,
} from '../ports/notification-store.port';
import {
  NotificationDirectory,
  NotificationProvider,
  NotificationRequest,
  error,
  render,
} from '../../domain/notification';
export class NotificationsService {
  async rule(
    companyId: number,
    actor: number,
    input: {
      code: string;
      eventType: string;
      template: string;
      category: string;
      recipients: number[];
      channels: NotificationRequest['channels'];
      enabled: boolean;
    },
    administrative = false,
  ) {
    if (administrative && input.enabled) {
      for (const recipient of [...new Set(input.recipients)]) await this.directory.resolve(recipient, companyId);
    }
    return this.tx(companyId, async (tx) => {
      const old = await this.store.findOne({
        where: { companyId, kind: 'RULE', key: input.code },
        transaction: tx,
      });
      const configured = { ...input, administrative: administrative || old?.data.administrative === true };
      const row = old
        ? await this.store.update(
            old,
            { status: input.enabled ? 'ACTIVE' : 'DISABLED', data: configured },
            { transaction: tx },
          )
        : await this.row(
            companyId,
            'RULE',
            input.code,
            input.enabled ? 'ACTIVE' : 'DISABLED',
            configured,
            tx,
          );
      await this.row(
        companyId,
        'AUDIT',
        randomUUID(),
        'RECORDED',
        { action: 'rule.updated', actor, id: row.id },
        tx,
      );
      return row;
    });
  }
  async consume(
    companyId: number,
    event: { id: string; type: string; variables: Record<string, string> },
  ) {
    const rules = await this.list(companyId, 'RULE');
    const results = [];
    for (const rule of rules) {
      if (rule.status !== 'ACTIVE' || rule.data.eventType !== event.type) continue;
      results.push(
        await this.send(companyId, 0, {
          key: `${event.id}:${rule.id}`,
          template: rule.data.template,
          category: rule.data.category,
          variables: event.variables,
          recipients: rule.data.recipients,
          channels: rule.data.channels,
        }, rule.data.administrative === true ? 'RULE' : undefined),
      );
    }
    return results;
  }
  report(companyId: number | null) {
    return this.tx(companyId, (tx) =>
      this.store.count({
        where: { companyId, kind: 'DELIVERY' },
        group: ['status'],
        transaction: tx,
      }),
    );
  }
  cleanup(companyId: number | null) {
    return this.tx(companyId, async (tx) => {
      const days = Number(process.env.NOTIFICATIONS_RETENTION_DAYS || 90);
      if (!Number.isSafeInteger(days) || days < 30) throw error('Retenção mínima de trinta dias.');
      return this.store.destroy({
        where: {
          companyId,
          kind: { [Op.in]: ['MESSAGE', 'DELIVERY', 'ATTEMPT'] },
          status: {
            [Op.in]: [
              'COMPLETED',
              'DELIVERED',
              'SUPPRESSED',
              'CANCELLED',
              'FAILED_PERMANENT',
              'REJECTED',
            ],
          },
          createdAt: { [Op.lt]: new Date(Date.now() - days * 86400000) },
        },
        transaction: tx,
      });
    });
  }
  async editTemplate(
    companyId: number | null,
    id: string,
    input: { subject: string; body: string },
    actor?: number,
  ) {
    return this.tx(companyId, async (tx) => {
      const row = await this.store.findOne({
        where: { companyId, id, kind: 'TEMPLATE' },
        transaction: tx,
        forUpdate: true,
      });
      if (!row) throw error('Modelo não encontrado.', 404);
      if (row.status !== 'DRAFT') throw error('Crie nova versão do modelo publicado.', 409);
      if (actor && row.data.mandatory) throw error('Modelo obrigatório reservado ao sistema.', 403);
      await this.store.update(row, { data: { ...row.data, ...input } }, { transaction: tx });
      if (actor) await this.row(companyId, 'AUDIT', randomUUID(), 'RECORDED', { action: 'template.updated', actor, id }, tx);
      return row;
    });
  }
  async preview(companyId: number | null, id: string, variables: Record<string, string>) {
    return this.tx(companyId, async (tx) => {
      const row = await this.store.findOne({
        where: { companyId, id, kind: 'TEMPLATE' },
        transaction: tx,
      });
      if (!row) throw error('Modelo não encontrado.', 404);
      return {
        subject: render(row.data.subject, variables),
        bodyText: render(row.data.body, variables),
        version: row.data.version,
      };
    });
  }
  async callback(
    companyId: number | null,
    id: string,
    providerMessageId: string,
    status: 'DELIVERED' | 'FAILED_PERMANENT',
  ) {
    return this.tx(companyId, async (tx) => {
      const row = await this.store.findOne({
        where: { companyId, id, kind: 'DELIVERY' },
        transaction: tx,
        forUpdate: true,
      });
      if (
        !row ||
        (row.data.providerMessageId !== providerMessageId &&
          !(row.status === 'UNKNOWN' && !row.data.providerMessageId))
      )
        throw error('Entrega não encontrada.', 404);
      if (row.status === status) return { accepted: true, idempotent: true };
      if (row.status === 'DELIVERED') return { accepted: true };
      if (!['ACCEPTED', 'UNKNOWN'].includes(row.status)) throw error('Estado incompatível.', 409);
      await this.store.update(
        row,
        { status, data: { ...row.data, providerMessageId } },
        { transaction: tx },
      );
      await this.row(
        companyId,
        'AUDIT',
        randomUUID(),
        'RECORDED',
        { action: 'provider.callback', id, status },
        tx,
      );
      return { accepted: true };
    });
  }
  async retry(companyId: number | null, actor: number, id: string) {
    return this.tx(companyId, async (tx) => {
      const row = await this.store.findOne({
        where: { companyId, id, kind: 'DELIVERY' },
        transaction: tx,
        forUpdate: true,
      });
      if (!row || row.status !== 'FAILED_PERMANENT')
        throw error('Entrega não permite nova tentativa.', 409);
      const message = await this.store.findOne({ where: { companyId, id: row.data.messageId, kind: 'MESSAGE' }, transaction: tx });
      if (!message || message.status === 'CANCELLED') throw error('O envio associado está indisponível ou cancelado.', 409);
      await this.store.update(
        row,
        { status: 'QUEUED', data: { ...row.data, nextAttemptAt: 0 } },
        { transaction: tx },
      );
      await this.row(
        companyId,
        'AUDIT',
        randomUUID(),
        'RECORDED',
        { action: 'delivery.retry', actor, id },
        tx,
      );
      return row;
    });
  }
  async preferences(companyId: number | null, userId: number) {
    return this.tx(companyId, (tx) =>
      this.store.findAll({ where: { companyId, userId, kind: 'PREFERENCE' }, transaction: tx }),
    );
  }
  async unread(companyId: number | null, userId: number) {
    return this.tx(companyId, async (tx) => {
      const count = await this.store.count({
        where: { companyId, userId, kind: 'DELIVERY', status: 'DELIVERED', 'data.channel': 'IN_APP', 'data.readState': 'UNREAD' },
        transaction: tx,
      });
      return { count: Number(count) };
    });
  }
  async readAll(companyId: number | null, userId: number) {
    return this.tx(companyId, async (tx) => {
      const rows = await this.store.findAll({
        where: { companyId, userId, kind: 'DELIVERY', status: 'DELIVERED', 'data.channel': 'IN_APP', 'data.readState': 'UNREAD' },
        transaction: tx,
      });
      for (const row of rows)
        if (row.data.channel === 'IN_APP' && row.data.readState === 'UNREAD')
          await this.store.update(
            row,
            { data: { ...row.data, readState: 'READ', readAt: new Date().toISOString() } },
            { transaction: tx },
          );
      return { updated: true };
    });
  }
  constructor(
    private directory: NotificationDirectory,
    private provider: NotificationProvider,
    private readonly store: NotificationStorePort,
  ) {}
  async tx<T>(companyId: number | null, fn: (tx: RecordStoreContext) => Promise<T>) {
    return this.store.transaction(companyId, fn);
  }
  private scope(companyId: number | null) {
    return companyId === null ? 'platform' : `tenant:${companyId}`;
  }
  private row<K extends NotificationKind>(
    companyId: number | null,
    kind: K,
    key: string,
    status: string,
    data: NotificationDataMap[K],
    tx: RecordStoreContext,
    userId: number | null = null,
  ) {
    return this.store.create(
      {
        id: randomUUID(),
        companyId,
        scopeKey: this.scope(companyId),
        kind,
        key,
        status,
        data,
        userId,
      },
      { transaction: tx },
    );
  }
  async template(
    companyId: number | null,
    actor: number,
    input: { code: string; subject: string; body: string; category: string; mandatory: boolean },
    administrative = false,
  ) {
    return this.tx(companyId, async (tx) => {
      const latest = await this.store.findAll({
        where: { companyId, kind: 'TEMPLATE', 'data.code': input.code },
        transaction: tx,
      });
      if (administrative && latest.some(row => row.data.mandatory))
        throw error('Este código está reservado a um modelo obrigatório.', 403);
      if (administrative && latest.some(row => row.data.category !== input.category))
        throw error('Uma nova versão deve conservar a categoria do modelo.', 409);
      const version = latest.reduce((highest, row) => Math.max(highest, row.data.version), 0) + 1;
      const template = await this.row(
        companyId,
        'TEMPLATE',
        `${input.code}:${version}`,
        'DRAFT',
        { ...input, version, actor },
        tx,
      );
      if (administrative) await this.row(companyId, 'AUDIT', randomUUID(), 'RECORDED',
        { action: 'template.created', actor, id: template.id }, tx);
      return template;
    });
  }
  async publish(companyId: number | null, actor: number, id: string, administrative = false) {
    return this.tx(companyId, async (tx) => {
      const row = await this.store.findOne({
        where: { id, companyId, kind: 'TEMPLATE' },
        transaction: tx,
        forUpdate: true,
      });
      if (!row) throw error('Modelo não encontrado.', 404);
      if (row.status !== 'DRAFT') throw error('Versão já publicada.', 409);
      if (administrative && row.data.mandatory) throw error('Modelo obrigatório reservado ao sistema.', 403);
      await this.store.update(
        row,
        { status: 'PUBLISHED', data: { ...row.data, publishedBy: actor } },
        { transaction: tx },
      );
      await this.row(
        companyId,
        'AUDIT',
        randomUUID(),
        'RECORDED',
        { action: 'template.published', actor, id },
        tx,
      );
      return row;
    });
  }
  async send(companyId: number | null, actor: number, input: NotificationRequest, origin?: 'CAMPAIGN' | 'RULE') {
    if (
      ['PAYROLL', 'PAYSLIP', 'PAYMENT'].includes(input.category) &&
      Object.keys(input.variables).some((k) =>
        /amount|salary|gross|net|iban|bank|salario|valor/i.test(k),
      )
    )
      throw error('Dados salariais sensíveis não são permitidos nas mensagens.');
    const addresses = await Promise.all(
      input.recipients.map(async (userId) => ({
        userId,
        ...(await this.directory.resolve(userId, companyId)),
      })),
    );
    return this.tx(companyId, async (tx) => {
      const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const old = await this.store.findOne({
        where: { scopeKey: this.scope(companyId), kind: 'MESSAGE', key: input.key },
        transaction: tx,
      });
      if (old) {
        if (old.data.fingerprint !== fingerprint) throw error('Chave de envio reutilizada.', 409);
        return old;
      }
      const templates = await this.store.findAll({
        where: { companyId, kind: 'TEMPLATE', status: 'PUBLISHED' },
        transaction: tx,
      });
      const template = templates
        .filter((t) => t.data.code === input.template)
        .sort((a, b) => b.data.version - a.data.version)[0];
      if (!template) throw error('Modelo publicado não encontrado.');
      if (origin && template.data.mandatory) throw error('Modelos obrigatórios são reservados a eventos do sistema.', 403);
      const scheduled = input.scheduledAt ? Date.parse(input.scheduledAt) : null;
      if (origin && scheduled !== null && (!Number.isFinite(scheduled) || scheduled <= Date.now()))
        throw error('Seleccione uma data de envio futura.');
      if (template.data.category !== input.category)
        throw error('Categoria incompatível com o modelo.');
      const subject = render(template.data.subject, input.variables),
        body = render(template.data.body, input.variables);
      const period = new Date().toISOString().slice(0, 10);
      let quota = await this.store.findOne({
        where: { scopeKey: this.scope(companyId), kind: 'QUOTA', key: period },
        transaction: tx,
      });
      const count = addresses.length * input.channels.length,
        used = Number(quota?.data.used || 0);
      if (used + count > Number(process.env.NOTIFICATIONS_DAILY_QUOTA || 10000))
        throw error('Quota diária excedida.', 429);
      if (quota)
        await this.store.update(quota, { data: { used: used + count } }, { transaction: tx });
      else quota = await this.row(companyId, 'QUOTA', period, 'ACTIVE', { used: count }, tx);
      const message = await this.row(
        companyId,
        'MESSAGE',
        input.key,
        input.scheduledAt ? 'SCHEDULED' : 'PENDING',
        {
          fingerprint,
          actor,
          category: input.category,
          templateVersion: template.data.version,
          templateCode: template.data.code,
          channels: input.channels,
          recipientCount: addresses.length,
          origin: origin ?? 'SYSTEM',
          subject,
          body,
          scheduledAt: scheduled === null ? new Date().toISOString() : new Date(scheduled).toISOString(),
        },
        tx,
      );
      for (const address of addresses)
        for (const channel of input.channels) {
          const preference = await this.store.findOne({
            where: {
              scopeKey: this.scope(companyId),
              kind: 'PREFERENCE',
              key: `${address.userId}:${input.category}:${channel}`,
            },
            transaction: tx,
          });
          const suppressed = preference?.data.enabled === false && !template.data.mandatory;
          const recipient =
            channel === 'EMAIL'
              ? address.email
              : channel === 'SMS'
                ? address.phone
                : String(address.userId);
          if (!recipient && !suppressed) throw error('Contacto verificado indisponível.');
          await this.row(
            companyId,
            'DELIVERY',
            `${message.id}:${address.userId}:${channel}`,
            suppressed ? 'SUPPRESSED' : 'QUEUED',
            {
              messageId: message.id,
              category: input.category,
              channel,
              recipient,
              subject,
              body,
              scheduledAt: message.data.scheduledAt,
              attempts: 0,
              readState: 'UNREAD',
            },
            tx,
            address.userId,
          );
        }
      await this.row(
        companyId,
        'AUDIT',
        randomUUID(),
        'RECORDED',
        { action: 'notification.created', actor, id: message.id },
        tx,
      );
      return message;
    });
  }
  inbox(companyId: number | null, userId: number, page = 1, state?: 'UNREAD' | 'READ' | 'ARCHIVED') {
    return this.tx(companyId, (tx) =>
      this.store.findAll({
        where: { companyId, userId, kind: 'DELIVERY', status: 'DELIVERED', 'data.channel': 'IN_APP',
          'data.readState': state ?? { [Op.in]: ['UNREAD', 'READ'] }, },
        transaction: tx,
        order: [['createdAt', 'DESC']],
        limit: 50,
        offset: (page - 1) * 50,
      }),
    );
  }
  inboxItem(companyId: number | null, userId: number, id: string) {
    return this.tx(companyId, async tx => {
      const row = await this.store.findOne({ where: { companyId, userId, id, kind: 'DELIVERY', status: 'DELIVERED', 'data.channel': 'IN_APP' }, transaction: tx });
      if (!row) throw error('Notificação não encontrada.', 404);
      return row;
    });
  }

  preferenceHistory(companyId: number | null, userId: number) {
    return this.tx(companyId, tx => this.store.findAll({ where: { companyId, kind: 'AUDIT',
      'data.userId': userId, 'data.action': 'preference.updated' }, order: [['createdAt', 'DESC']], limit: 100, transaction: tx }));
  }

  async mark(companyId: number | null, userId: number, id: string, state: string) {
    return this.tx(companyId, async (tx) => {
      const row = await this.store.findOne({
        where: { companyId, userId, id, kind: 'DELIVERY', status: 'DELIVERED' },
        transaction: tx,
      });
      if (!row || row.data.channel !== 'IN_APP') throw error('Notificação não encontrada.', 404);
      if (row.data.readState === state || row.data.readState === 'ARCHIVED') return row;
      await this.store.update(
        row,
        { data: { ...row.data, readState: state, readAt: row.data.readAt ?? new Date().toISOString() } },
        { transaction: tx },
      );
      return row;
    });
  }
  preference(
    companyId: number | null,
    userId: number,
    input: { category: string; channel: string; enabled: boolean },
  ) {
    return this.tx(companyId, async (tx) => {
      const key = `${userId}:${input.category}:${input.channel}`,
        row = await this.store.findOne({
          where: { scopeKey: this.scope(companyId), kind: 'PREFERENCE', key },
          transaction: tx,
        });
      if (row) await this.store.update(row, { data: input }, { transaction: tx });
      else await this.row(companyId, 'PREFERENCE', key, 'ACTIVE', input, tx, userId);
      await this.row(
        companyId,
        'AUDIT',
        randomUUID(),
        'RECORDED',
        { action: 'preference.updated', userId, ...input },
        tx,
      );
      return input;
    });
  }
  list<K extends NotificationKind>(
    companyId: number | null,
    kind: K,
  ): Promise<NotificationRecord<K>[]>;
  list(companyId: number | null, kind: string): Promise<NotificationRecord[]>;
  list(companyId: number | null, kind: string) {
    const checkedKind = notificationKindSchema.parse(kind);
    return this.tx(companyId, (tx) =>
      this.store.findAll({
        where: { companyId, kind: checkedKind },
        limit: 200,
        order: [['createdAt', 'DESC']],
        transaction: tx,
      }),
    );
  }
  adminList<K extends NotificationKind>(companyId: number | null, kind: K, filter: {
    page: number; limit: number; status?: string; channel?: string; origin?: string;
  }) {
    return this.tx(companyId, async tx => {
      const where = { companyId, kind,
        ...(filter.status ? { status: filter.status } : {}),
        ...(kind === 'DELIVERY' && filter.channel ? { 'data.channel': filter.channel } : {}),
        ...(kind === 'MESSAGE' && filter.origin ? { 'data.origin': filter.origin } : {}),
      };
      const total = Number(await this.store.count({ where, transaction: tx }));
      const items = await this.store.findAll({ where, transaction: tx,
        limit: filter.limit, offset: (filter.page - 1) * filter.limit, order: [['createdAt', 'DESC'], ['id', 'DESC']] });
      return { items, page: filter.page, limit: filter.limit, total };
    });
  }

  attempts(companyId: number | null, deliveryId: string) {
    return this.tx(companyId, async tx => {
      const delivery = await this.store.findOne({ where: { companyId, id: deliveryId, kind: 'DELIVERY' }, transaction: tx });
      if (!delivery) throw error('Entrega não encontrada.', 404);
      return this.store.findAll({ where: { companyId, kind: 'ATTEMPT', 'data.deliveryId': deliveryId },
        transaction: tx, limit: 100, order: [['createdAt', 'DESC']] });
    });
  }

  templateVersions(companyId: number | null, id: string) {
    return this.tx(companyId, async tx => {
      const template = await this.store.findOne({ where: { companyId, id, kind: 'TEMPLATE' }, transaction: tx });
      if (!template) throw error('Modelo não encontrado.', 404);
      const versions = await this.store.findAll({ where: { companyId, kind: 'TEMPLATE', 'data.code': template.data.code },
        transaction: tx, limit: 100, order: [['createdAt', 'DESC']] });
      return versions.sort((left, right) => right.data.version - left.data.version);
    });
  }

  categoryPolicy(companyId: number | null) {
    return this.tx(companyId, async tx => {
      const templates = await this.store.findAll({ where: { companyId, kind: 'TEMPLATE', status: 'PUBLISHED' }, transaction: tx });
      const latest = new Map<string, NotificationRecord<'TEMPLATE'>>();
      for (const row of templates) {
        if ((latest.get(row.data.code)?.data.version ?? 0) < row.data.version) latest.set(row.data.code, row);
      }
      return [...latest.values()].map(row => ({ code: row.data.code, category: row.data.category, mandatory: row.data.mandatory, version: row.data.version }));
    });
  }

  adminReport(companyId: number | null) {
    return this.tx(companyId, async tx => {
      const messages = Number(await this.store.count({ where: { companyId, kind: 'MESSAGE' }, transaction: tx }));
      const rows = await this.store.count({ where: { companyId, kind: 'DELIVERY' }, group: ['status'], transaction: tx });
      const byStatus = Object.fromEntries((Array.isArray(rows) ? rows : []).map(row => [String(row.status), Number(row.count)]));
      const byChannel: Record<string, number> = {};
      for (const channel of ['IN_APP', 'EMAIL', 'SMS']) {
        byChannel[channel] = Number(await this.store.count({ where: { companyId, kind: 'DELIVERY', 'data.channel': channel }, transaction: tx }));
      }
      return { messages, byStatus, byChannel, totalDeliveries: Object.values(byStatus).reduce((sum, count) => sum + count, 0) };
    });
  }

  async cancel(companyId: number | null, id: string, actor?: number) {
    return this.tx(companyId, async (tx) => {
      const message = await this.store.findOne({
        where: { id, companyId, kind: 'MESSAGE' },
        transaction: tx,
      });
      if (!message) throw error('Envio não encontrado.', 404);
      if (actor && message.data.origin !== 'CAMPAIGN') throw error('A notificação não é uma campanha.', 409);
      if (message.status === 'CANCELLED') return message;
      if (!['PENDING', 'SCHEDULED'].includes(message.status)) throw error('O envio já foi processado.', 409);
      const rows = await this.store.findAll({
        where: { companyId, kind: 'DELIVERY', status: 'QUEUED', 'data.messageId': id },
        transaction: tx,
      });
      for (const row of rows) await this.store.update(row, { status: 'CANCELLED' }, { transaction: tx });
      await this.store.update(message, { status: 'CANCELLED' }, { transaction: tx });
      if (actor) await this.row(companyId, 'AUDIT', randomUUID(), 'RECORDED', { action: 'notification.cancelled', actor, id }, tx);
      return message;
    });
  }
  async process(companyId: number | null) {
    return this.tx(companyId, async (tx) => {
      const deliveries = await this.store.findAll({
        where: { companyId, kind: 'DELIVERY', status: 'QUEUED',
          'data.scheduledAt': { [Op.lte]: new Date().toISOString() },
          [Op.or]: [{ 'data.nextAttemptAt': { [Op.is]: null } }, { 'data.nextAttemptAt': { [Op.lte]: Date.now() } }], },
        order: [['createdAt', 'ASC']],
        limit: 20,
        transaction: tx,
        forUpdate: true,
        skipLocked: true,
      });
      for (const row of deliveries) {
        const now = new Date().toISOString();
        if (row.data.scheduledAt > now || Number(row.data.nextAttemptAt || 0) > Date.now())
          continue;
        const attempts = Number(row.data.attempts) + 1;
        try {
          if (!row.data.recipient) throw error('Contacto indisponível para entrega.');
          const result: Awaited<ReturnType<NotificationProvider['send']>> =
            row.data.channel === 'IN_APP'
              ? { status: 'DELIVERED' }
              : await this.provider.send({
                  id: row.id,
                  channel: row.data.channel,
                  recipient: row.data.recipient,
                  subject: row.data.subject,
                  body: row.data.body,
                });
          await this.store.update(
            row,
            {
              status: result.status === 'REJECTED' ? 'FAILED_PERMANENT' : result.status,
              data: { ...row.data, attempts, providerMessageId: result.providerMessageId },
            },
            { transaction: tx },
          );
          await this.row(
            companyId,
            'ATTEMPT',
            `${row.id}:${attempts}`,
            result.status,
            { deliveryId: row.id, attempts },
            tx,
          );
        } catch (err) {
          await this.store.update(
            row,
            {
              status: attempts >= 5 ? 'FAILED_PERMANENT' : 'QUEUED',
              data: {
                ...row.data,
                attempts,
                nextAttemptAt: Date.now() + 2 ** attempts * 10000,
                lastError: String(err),
              },
            },
            { transaction: tx },
          );
          await this.row(
            companyId,
            'ATTEMPT',
            `${row.id}:${attempts}`,
            'FAILED_TEMPORARY',
            { deliveryId: row.id, attempts, error: String(err) },
            tx,
          );
        }
      }
      const messages = await this.store.findAll({
        where: { companyId, kind: 'MESSAGE', status: { [Op.in]: ['PENDING', 'SCHEDULED'] } },
        limit: 100,
        transaction: tx,
      });
      for (const m of messages) {
        const rows = await this.store.findAll({
          where: { companyId, kind: 'DELIVERY', key: { [Op.like]: `${m.id}:%` } },
          transaction: tx,
        });
        if (rows.some((r) => r.status === 'QUEUED')) continue;
        await this.store.update(
          m,
          {
            status: rows.some((r) => ['FAILED_PERMANENT', 'UNKNOWN'].includes(r.status))
              ? 'PARTIALLY_COMPLETED'
              : 'COMPLETED',
          },
          { transaction: tx },
        );
      }
    });
  }
}
