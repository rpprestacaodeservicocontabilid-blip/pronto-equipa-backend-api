jest.mock('../../../infra/database', () => {
  const { Sequelize } = jest.requireActual<typeof import('sequelize')>('sequelize');
  return { sequelize: new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }) };
});

import { sequelize } from '../../../infra/database';
import { SupportRecordRow } from '../infrastructure/persistence/models/support-record.model';
import { SequelizeSupportStore } from '../infrastructure/persistence/repositories/sequelize-support-store';
import { SupportApplicationService } from './use-cases/support-application.service';

describe('Support application workflows', () => {
  let service: SupportApplicationService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const notifications = {
    notifyTicketCreated: jest.fn().mockResolvedValue(undefined),
    notifyTicketUpdated: jest.fn().mockResolvedValue(undefined),
  };
  const entitlements = {
    getSupportEntitlements: jest.fn().mockResolvedValue({
      supportEnabled: true,
      supportTier: 'DEFAULT',
      allowedChannels: ['PORTAL'],
      slaPolicyCode: 'DEFAULT',
    }),
  };
  const documents = { assertAvailable: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });
  afterAll(async () => {
    await sequelize.close();
  });
  beforeEach(async () => {
    await SupportRecordRow.destroy({ where: {} });
    jest.clearAllMocks();
    service = new SupportApplicationService(
      new SequelizeSupportStore(),
      audit,
      entitlements,
      notifications,
      documents,
    );
  });

  const ticketInput = () => ({
    type: 'TECHNICAL_SUPPORT' as const,
    categoryCode: 'ACCESS',
    subject: 'Falha no acesso',
    description: 'Não consigo iniciar sessão na plataforma.',
    idempotencyKey: 'support-request-0001',
  });

  it('persists tickets idempotently and rejects duplicate requests', async () => {
    const first = await service.createTicket(7, 11, ticketInput());
    const replay = await service.createTicket(7, 11, ticketInput());
    expect(first.id).toBe(replay.id);
    expect(first.ticketNumber).toMatch(/^SUP-\d{4}-000001$/);
    await expect(
      service.createTicket(7, 11, {
        ...ticketInput(),
        idempotencyKey: 'support-request-0002',
      }),
    ).rejects.toThrow('possivelmente duplicado');
    expect(notifications.notifyTicketCreated).toHaveBeenCalledTimes(1);
  });

  it('isolates tickets by tenant and requester', async () => {
    const ticket = await service.createTicket(7, 11, ticketInput());
    await expect(service.getTicket(7, 12, ticket.id)).rejects.toThrow('Ticket não encontrado');
    await expect(service.getTicket(8, 11, ticket.id)).rejects.toThrow('Ticket não encontrado');
    expect((await service.listTickets(7, 11, { ownOnly: true, page: 1, limit: 20 })).total).toBe(1);
    expect((await service.listTickets(7, 12, { ownOnly: true, page: 1, limit: 20 })).total).toBe(0);
  });

  it('does not expose internal notes to requesters and preserves status history', async () => {
    const ticket = await service.createTicket(7, 11, ticketInput());
    await service.addMessage(
      7,
      22,
      ticket.id,
      {
        body: 'Nota interna de triagem',
        visibility: 'INTERNAL',
        idempotencyKey: 'internal-note-0001',
      },
      true,
    );
    await service.addMessage(
      7,
      22,
      ticket.id,
      {
        body: 'Já estamos a analisar o pedido.',
        visibility: 'PUBLIC',
        idempotencyKey: 'public-message-0001',
      },
      true,
    );
    expect((await service.getTicket(7, 11, ticket.id)).messages).toHaveLength(1);
    expect((await service.getTicket(7, 22, ticket.id, true)).messages).toHaveLength(2);
    await service.transition(7, 22, ticket.id, 'IN_PROGRESS');
    await service.transition(7, 22, ticket.id, 'RESOLVED', 'Acesso restabelecido');
    await service.transition(7, 22, ticket.id, 'CLOSED');
    await service.transition(7, 22, ticket.id, 'OPEN');
    expect(
      (await service.historyForTicket(7, 11, ticket.id, false)).map((item) => item.action),
    ).not.toContain('INTERNAL_NOTE');
  });

  it('rejects invalid state transitions and conflicts on changed idempotent messages', async () => {
    const ticket = await service.createTicket(7, 11, ticketInput());
    await expect(service.transition(7, 11, ticket.id, 'CLOSED')).rejects.toThrow('não permitida');
    const message = {
      body: 'Informação adicional.',
      visibility: 'PUBLIC' as const,
      idempotencyKey: 'message-idempotency-0001',
    };
    await service.addMessage(7, 11, ticket.id, message, false);
    await expect(
      service.addMessage(7, 11, ticket.id, { ...message, body: 'Conteúdo diferente.' }, false),
    ).rejects.toThrow('Chave idempotente reutilizada');
  });
  it('searches published article views and keeps internal articles private', async () => {
    const article = await service.createArticle(7, 22, {
      slug: 'reset-access',
      title: 'Recuperar acesso',
      content: 'Procedimento para recuperar acesso.',
      visibility: 'TENANT',
    });
    expect(await service.searchArticles(7, 'acesso')).toHaveLength(0);
    expect((await service.publishArticle(7, 22, article.id)).status).toBe('PUBLISHED');
    expect((await service.searchArticles(7, 'acesso')).map((row) => row.id)).toEqual([article.id]);
    expect(await service.searchArticles(8, 'acesso')).toHaveLength(0);
    await service.updateArticle(7, 22, article.id, { visibility: 'INTERNAL' });
    expect(await service.searchArticles(7, 'acesso')).toHaveLength(0);
    expect(await service.searchArticles(7, 'acesso', true)).toHaveLength(1);
  });
  it('keeps record identity and state authoritative when presenting resource data', async () => {
    const resource = await service.createResource(7, 22, 'CATEGORY', {
      code: 'GENERAL',
      name: 'Geral',
      id: 'spoofed',
      companyId: 8,
    });
    expect(resource.id).not.toBe('spoofed');
    expect(resource.companyId).toBe(7);
  });
  it('creates incidents from the documented title fields without requiring a resource code', async () => {
    const incident = await service.createIncident(7, 22, {
      title: 'Falha no serviço',
      description: 'Falha temporária na consulta de dados.',
      severity: 'MAJOR',
      affectedServices: ['payroll'],
    });
    expect(incident.status).toBe('OPEN');
    expect(incident.title).toBe('Falha no serviço');
    expect((await service.listKind(7, 'INCIDENT')).map((row) => row.id)).toEqual([incident.id]);
  });
});
