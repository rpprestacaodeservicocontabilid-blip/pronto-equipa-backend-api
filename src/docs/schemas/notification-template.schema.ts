/**
 * @swagger
 * components:
 *   schemas:
 *
 *     CreateNotificationTemplateRequest:
 *       type: object
 *       description: Dados para criação de um template de notificação.
 *       additionalProperties: true
 *       example:
 *         name: "Partida agendada"
 *         title: "Nova partida agendada"
 *         content: "A sua partida foi agendada para {{matchDate}}."
 *         type: "MATCH"
 *
 *     UpdateNotificationTemplateRequest:
 *       type: object
 *       description: Dados para atualização de um template de notificação.
 *       additionalProperties: true
 *       example:
 *         name: "Partida agendada"
 *         title: "A sua partida foi agendada"
 *         content: "A sua partida contra {{opponent}} será realizada em {{matchDate}}."
 *
 *     NotificationTemplate:
 *       type: object
 *       description: Template utilizado para geração de notificações.
 *       additionalProperties: true
 *       properties:
 *         id:
 *           type: integer
 *           description: ID do template.
 *           example: 10
 *         name:
 *           type: string
 *           description: Nome identificador do template.
 *           example: "Partida agendada"
 *         title:
 *           type: string
 *           description: Título utilizado nas notificações.
 *           example: "Nova partida agendada"
 *         content:
 *           type: string
 *           description: Conteúdo ou corpo do template.
 *           example: "A sua partida foi agendada para {{matchDate}}."
 *         type:
 *           type: string
 *           description: Tipo ou categoria da notificação.
 *           example: "MATCH"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-30T10:00:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-30T10:00:00.000Z"
 */
