import { NotificationsService } from '../../../notifications/application/use-cases/notifications.service';
import { SupportNotificationPort } from '../../application/ports/support-ports';

export class SupportNotificationAdapter implements SupportNotificationPort {
  constructor(private readonly notifications: NotificationsService) {}

  async notifyTicketCreated(input: {
    tenantId: string;
    ticketId: string;
    recipientUserIds: string[];
    idempotencyKey: string;
  }) {
    await this.notifications.consume(Number(input.tenantId), {
      id: input.idempotencyKey,
      type: 'support.ticket.created',
      variables: { ticketId: input.ticketId },
    });
  }

  async notifyTicketUpdated(input: {
    tenantId: string;
    ticketId: string;
    recipientUserIds: string[];
    idempotencyKey: string;
  }) {
    await this.notifications.consume(Number(input.tenantId), {
      id: input.idempotencyKey,
      type: 'support.ticket.updated',
      variables: { ticketId: input.ticketId },
    });
  }
}
