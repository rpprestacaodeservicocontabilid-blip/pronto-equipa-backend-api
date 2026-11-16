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
  ) {
    return this.tx(companyId, async (tx) => {
      const old = await this.store.findOne({
        where: { companyId, kind: 'RULE', key: input.code },
        transaction: tx,
      });
      const row = old
        ? await this.store.update(
            old,
            { status: input.enabled ? 'ACTIVE' : 'DISABLED', data: input },
            { transaction: tx },
          )
        : await this.row(
            companyId,
            'RULE',
            input.code,
            input.enabled ? 'ACTIVE' : 'DISABLED',
            input,
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
        }),
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
  ) {
    return this.tx(companyId, async (tx) => {
      const row = await this.store.findOne({
        where: { companyId, id, kind: 'TEMPLATE' },
        transaction: tx,
        forUpdate: true,
      });
      if (!row) throw error('Modelo não encontrado.', 404);
      if (row.status !== 'DRAFT') throw error('Crie nova versão do modelo publicado.', 409);
      await this.store.update(row, { data: { ...row.data, ...input } }, { transaction: tx });
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
      const rows = await this.store.findAll({
        where: { companyId, userId, kind: 'DELIVERY', status: 'DELIVERED' },
        transaction: tx,
      });
      return {
        count: rows.filter((r) => r.data.channel === 'IN_APP' && r.data.readState === 'UNREAD')
          .length,
      };
    });
  }
  async readAll(companyId: number | null, userId: number) {
    return this.tx(companyId, async (tx) => {
      const rows = await this.store.findAll({
        where: { companyId, userId, kind: 'DELIVERY', status: 'DELIVERED' },
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
  ) {
    return this.tx(companyId, async (tx) => {
      const latest = await this.store.findAll({
        where: { companyId, kind: 'TEMPLATE', key: { [Op.like]: `${input.code}:%` } },
        transaction: tx,
      });
      const version = latest.length + 1;
      return this.row(
        companyId,
        'TEMPLATE',
        `${input.code}:${version}`,
        'DRAFT',
        { ...input, version, actor },
        tx,
      );
    });
  }
  async publish(companyId: number | null, actor: number, id: string) {
    return this.tx(companyId, async (tx) => {
      const row = await this.store.findOne({
        where: { id, companyId, kind: 'TEMPLATE' },
        transaction: tx,
        forUpdate: true,
      });
      if (!row) throw error('Modelo não encontrado.', 404);
      if (row.status !== 'DRAFT') throw error('Versão já publicada.', 409);
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
  async send(companyId: number | null, actor: number, input: NotificationRequest) {
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
          subject,
          body,
          scheduledAt: input.scheduledAt || new Date().toISOString(),
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
  inbox(companyId: number | null, userId: number, page = 1) {
    return this.tx(companyId, (tx) =>
      this.store.findAll({
        where: { companyId, userId, kind: 'DELIVERY', status: 'DELIVERED' },
        transaction: tx,
        order: [['createdAt', 'DESC']],
        limit: 50,
        offset: (page - 1) * 50,
      }),
    );
  }
  async mark(companyId: number | null, userId: number, id: string, state: string) {
    return this.tx(companyId, async (tx) => {
      const row = await this.store.findOne({
        where: { companyId, userId, id, kind: 'DELIVERY' },
        transaction: tx,
      });
      if (!row || row.data.channel !== 'IN_APP') throw error('Notificação não encontrada.', 404);
      await this.store.update(
        row,
        { data: { ...row.data, readState: state, readAt: new Date().toISOString() } },
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
  async cancel(companyId: number | null, id: string) {
    return this.tx(companyId, async (tx) => {
      const message = await this.store.findOne({
        where: { id, companyId, kind: 'MESSAGE' },
        transaction: tx,
      });
      if (!message) throw error('Envio não encontrado.', 404);
      const rows = await this.store.findAll({
        where: { companyId, kind: 'DELIVERY', status: 'QUEUED' },
        transaction: tx,
      });
      for (const row of rows)
        if (row.data.messageId === id)
          await this.store.update(row, { status: 'CANCELLED' }, { transaction: tx });
      await this.store.update(message, { status: 'CANCELLED' }, { transaction: tx });
      return message;
    });
  }
  async process(companyId: number | null) {
    return this.tx(companyId, async (tx) => {
      const deliveries = await this.store.findAll({
        where: { companyId, kind: 'DELIVERY', status: 'QUEUED' },
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
