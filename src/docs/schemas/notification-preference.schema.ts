/**
 * @swagger
 * components:
 *   schemas:
 *
 *     UpdateNotificationPreferenceRequest:
 *       type: object
 *       description: Dados para atualização das preferências de notificações.
 *       additionalProperties: true
 *       example:
 *         email: true
 *         push: true
 *         sms: false
 *
 *     NotificationChannelRequest:
 *       type: object
 *       required:
 *         - channel
 *       properties:
 *         channel:
 *           type: string
 *           description: Canal de notificação a ativar ou desativar.
 *           example: "email"
 *
 *     NotificationPreference:
 *       type: object
 *       description: Preferências de notificação de um utilizador.
 *       additionalProperties: true
 *       properties:
 *         userId:
 *           type: integer
 *           description: ID do utilizador.
 *           example: 15
 *         email:
 *           type: boolean
 *           description: Indica se as notificações por email estão habilitadas.
 *           example: true
 *         push:
 *           type: boolean
 *           description: Indica se as notificações push estão habilitadas.
 *           example: true
 *         sms:
 *           type: boolean
 *           description: Indica se as notificações SMS estão habilitadas.
 *           example: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-30T10:00:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-30T10:30:00.000Z"
 */
