/**
 * @swagger
 * components:
 *   schemas:
 *
 *     CreateNotificationRequest:
 *       type: object
 *       description: Dados necessários para criar uma notificação. A estrutura completa é definida pelo caso de uso.
 *       additionalProperties: true
 *       example:
 *         userId: 15
 *         title: "Nova partida agendada"
 *         message: "A sua partida foi agendada para amanhã às 18h."
 *         type: "MATCH"
 *
 *     SendBulkNotificationRequest:
 *       type: object
 *       description: Dados para envio de uma notificação para múltiplos destinatários.
 *       additionalProperties: true
 *       example:
 *         userIds: [10, 15, 20]
 *         title: "Nova partida"
 *         message: "Foi encontrada uma nova partida para a sua equipa."
 *         type: "MATCH"
 *
 *     ScheduleNotificationRequest:
 *       type: object
 *       required:
 *         - scheduledAt
 *       properties:
 *         scheduledAt:
 *           type: string
 *           format: date-time
 *           description: Data e hora em que a notificação deverá ser enviada.
 *           example: "2026-10-15T18:00:00.000Z"
 *
 *     Notification:
 *       type: object
 *       description: Representação de uma notificação. Os campos adicionais dependem do domínio de notificações.
 *       additionalProperties: true
 *       properties:
 *         id:
 *           type: integer
 *           description: ID da notificação.
 *           example: 125
 *         userId:
 *           type: integer
 *           description: ID do utilizador destinatário.
 *           example: 15
 *         title:
 *           type: string
 *           description: Título da notificação.
 *           example: "Nova partida agendada"
 *         message:
 *           type: string
 *           description: Conteúdo da notificação.
 *           example: "A sua partida foi agendada para amanhã às 18h."
 *         isRead:
 *           type: boolean
 *           description: Indica se a notificação já foi lida.
 *           example: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-30T18:00:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-30T18:00:00.000Z"
 *
 *     NotificationList:
 *       type: array
 *       items:
 *         $ref: '#/components/schemas/Notification'
 *
 *     NotificationPagination:
 *       type: object
 *       description: Resultado paginado das notificações de um utilizador.
 *       additionalProperties: true
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Notification'
 *         page:
 *           type: integer
 *           example: 1
 *         limit:
 *           type: integer
 *           example: 20
 *         total:
 *           type: integer
 *           example: 45
 *
 *     NotificationActionResponse:
 *       type: object
 *       description: Resultado de uma operação sobre uma notificação.
 *       additionalProperties: true
 *       example:
 *         success: true
 *         message: "Operação realizada com sucesso."
 */