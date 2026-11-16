import { SequelizeNotificationStore } from '../infrastructure/persistence/repositories/sequelize-notification-store';
jest.mock('../../../infra/database', () => {
  const { Sequelize } = jest.requireActual<typeof import('sequelize')>('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});
import { sequelize } from '../../../infra/database';
import { NotificationsService } from './use-cases/notifications.service';
import { NotificationRow } from '../infrastructure/persistence/models/notification.model';
describe('Notifications persistence and scope', () => {
  let service: NotificationsService;
  let provider: jest.Mock;
  let resolve: jest.Mock;
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });
  afterAll(async () => {
    await sequelize.close();
  });
  beforeEach(async () => {
    await NotificationRow.destroy({ where: {} });
    provider = jest.fn().mockResolvedValue({ status: 'ACCEPTED', providerMessageId: 'provider-1' });
    resolve = jest.fn().mockResolvedValue({ email: 'test@example.invalid', phone: null });
    service = new NotificationsService(
      { resolve },
      { send: provider },
      new SequelizeNotificationStore(),
    );
    const template = await service.template(1, 1, {
      code: 'TEST_TEMPLATE',
      category: 'SYSTEM',
      subject: 'Aviso',
      body: 'Olá {{name}}',
      mandatory: false,
    });
    await service.publish(1, 1, template.id);
  });
  const input = () => ({
    key: 'event-123456',
    template: 'TEST_TEMPLATE',
    category: 'SYSTEM',
    recipients: [2],
    channels: ['IN_APP' as const],
    variables: { name: 'Ana' },
  });
  it('deduplicates requests and rejects conflicting reuse', async () => {
    const first = await service.send(1, 1, input());
    expect((await service.send(1, 1, input())).id).toBe(first.id);
    await expect(service.send(1, 1, { ...input(), variables: { name: 'Bia' } })).rejects.toThrow(
      'reutilizada',
    );
    expect((await service.list(1, 'DELIVERY')).length).toBe(1);
  });
  it('keeps tenant and recipient inboxes isolated and tracks read state', async () => {
    await service.send(1, 1, input());
    await service.process(1);
    expect(await service.unread(1, 2)).toEqual({ count: 1 });
    expect(await service.inbox(2, 2)).toHaveLength(0);
    expect(await service.inbox(1, 3)).toHaveLength(0);
    const [delivery] = await service.inbox(1, 2);
    await expect(service.mark(1, 3, delivery.id, 'READ')).rejects.toThrow();
    await service.mark(1, 2, delivery.id, 'READ');
    expect(await service.unread(1, 2)).toEqual({ count: 0 });
  });
  it('enforces preferences without contacting the provider', async () => {
    await service.preference(1, 2, { category: 'SYSTEM', channel: 'EMAIL', enabled: false });
    await service.send(1, 1, { ...input(), channels: ['EMAIL'] });
    await service.process(1);
    expect(provider).not.toHaveBeenCalled();
    expect((await service.list(1, 'DELIVERY'))[0].status).toBe('SUPPRESSED');
  });
  it('does not retry an unknown provider outcome', async () => {
    provider.mockResolvedValue({ status: 'UNKNOWN' });
    await service.send(1, 1, { ...input(), channels: ['EMAIL'] });
    await service.process(1);
    await service.process(1);
    expect(provider).toHaveBeenCalledTimes(1);
    const [delivery] = await service.list(1, 'DELIVERY');
    await expect(service.retry(1, 1, delivery.id)).rejects.toThrow();
  });
  it('protects published templates from editing', async () => {
    const [template] = await service.list(1, 'TEMPLATE');
    await expect(
      service.editTemplate(1, template.id, { subject: 'Changed', body: 'Changed' }),
    ).rejects.toThrow();
  });
  it('consumes only configured domain events and deduplicates replay', async () => {
    await service.rule(1, 1, {
      code: 'TEST_RULE',
      eventType: 'employees.created',
      template: 'TEST_TEMPLATE',
      category: 'SYSTEM',
      recipients: [2],
      channels: ['IN_APP'],
      enabled: true,
    });
    expect(
      await service.consume(1, {
        id: 'source-event-123',
        type: 'payroll.closed',
        variables: { name: 'Ana' },
      }),
    ).toHaveLength(0);
    await service.consume(1, {
      id: 'source-event-123',
      type: 'employees.created',
      variables: { name: 'Ana' },
    });
    await service.consume(1, {
      id: 'source-event-123',
      type: 'employees.created',
      variables: { name: 'Ana' },
    });
    expect(await service.list(1, 'DELIVERY')).toHaveLength(1);
  });
  it('accepts an authoritative signed callback after a timeout without resending', async () => {
    provider.mockResolvedValue({ status: 'UNKNOWN' });
    await service.send(1, 1, { ...input(), channels: ['EMAIL'] });
    await service.process(1);
    const [delivery] = await service.list(1, 'DELIVERY');
    await service.callback(1, delivery.id, 'late-provider-1', 'DELIVERED');
    expect((await service.list(1, 'DELIVERY'))[0].status).toBe('DELIVERED');
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it('cancels pending deliveries before dispatch', async () => {
    const message = await service.send(1, 1, input());
    await service.cancel(1, message.id);
    await service.process(1);
    expect((await service.list(1, 'DELIVERY'))[0].status).toBe('CANCELLED');
  });
  it('rejects corrupt stored delivery data before contacting the provider', async () => {
    await service.send(1, 1, { ...input(), channels: ['EMAIL'] });
    const [delivery] = await service.list(1, 'DELIVERY');
    await NotificationRow.update(
      { data: { ...delivery.data, attempts: 'invalid' } },
      { where: { id: delivery.id } },
    );
    await expect(service.process(1)).rejects.toThrow('Invalid persisted notification payload');
    expect(provider).not.toHaveBeenCalled();
    expect((await NotificationRow.findByPk(delivery.id))?.status).toBe('QUEUED');
  });
  it('does not accept provider confirmations for another delivery identifier', async () => {
    await service.send(1, 1, { ...input(), channels: ['EMAIL'] });
    await service.process(1);
    const [delivery] = await service.list(1, 'DELIVERY');
    await expect(service.callback(2, delivery.id, 'provider-1', 'DELIVERED')).rejects.toThrow();
    await expect(service.callback(1, delivery.id, 'wrong', 'DELIVERED')).rejects.toThrow();
    await service.callback(1, delivery.id, 'provider-1', 'DELIVERED');
    expect(await service.callback(1, delivery.id, 'provider-1', 'DELIVERED')).toEqual({
      accepted: true,
      idempotent: true,
    });
  });
});
