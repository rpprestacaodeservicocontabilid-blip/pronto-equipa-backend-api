/**
 * @swagger
 * components:
 *   schemas:
 *
 *     Session:
 *       type: object
 *       description: Informações de uma sessão autenticada.
 *       properties:
 *         id:
 *           type: integer
 *           minimum: 1
 *           description: ID da sessão.
 *           example: 42
 *         userId:
 *           type: integer
 *           minimum: 1
 *           description: ID do utilizador associado à sessão.
 *           example: 15
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Data e hora em que a sessão foi criada.
 *           example: 2026-09-16T10:30:00.000Z
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Data e hora da última atualização da sessão.
 *           example: 2026-09-16T11:45:00.000Z
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           description: Data e hora de expiração da sessão.
 *           example: 2026-09-23T10:30:00.000Z
 *
 *     SessionResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/Session'
 *
 *     SessionRevokeResponse:
 *       type: object
 *       description: Resposta da revogação de uma sessão.
 *       nullable: true
 *       example: null
 *
 *     SessionRevokeAllResponse:
 *       type: object
 *       description: Resposta da revogação de todas as sessões.
 *       nullable: true
 *       example: null
 */
