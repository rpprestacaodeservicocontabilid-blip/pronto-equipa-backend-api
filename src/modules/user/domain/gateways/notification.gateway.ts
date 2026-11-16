/**
 * Porta de notificações do utilizador.
 *
 * Espelha o contrato efectivamente implementado pelo
 * `NotificationGatewayImpl` (tipos de evento enviados
 * ao serviço de notificações).
 */
export interface NotificationGateway {
  notifyUserCreated(userId: number): Promise<void>;

  notifyUserActivated(userId: number): Promise<void>;

  notifyUserDeactivated(userId: number): Promise<void>;
}
