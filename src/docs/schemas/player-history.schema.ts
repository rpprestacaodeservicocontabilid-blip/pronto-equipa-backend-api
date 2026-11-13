/**
 * @swagger
 * components:
 *   schemas:
 *
 *     PlayerHistoryType:
 *       type: string
 *       description: Tipo de acontecimento registado no histórico do jogador.
 *       example: TRANSFER
 *
 *     CreatePlayerHistoryRequest:
 *       type: object
 *       required:
 *         - playerId
 *         - type
 *       properties:
 *         playerId:
 *           oneOf:
 *             - type: string
 *               format: uuid
 *             - type: integer
 *               format: int64
 *           description: Identificador do jogador.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *         type:
 *           $ref: '#/components/schemas/PlayerHistoryType'
 *
 *         description:
 *           type: string
 *           minLength: 3
 *           maxLength: 500
 *           description: Descrição do acontecimento.
 *           example: "Jogador transferido para a equipa principal."
 *
 *         metadata:
 *           type: object
 *           additionalProperties: true
 *           description: Dados adicionais associados ao acontecimento.
 *           example:
 *             previousTeamId: 10
 *             newTeamId: 15
 *             reason: "Transferência"
 *
 *         occurredAt:
 *           type: string
 *           format: date-time
 *           description: Data e hora em que o acontecimento ocorreu. Não pode ser futura.
 *           example: "2026-09-15T18:30:00.000Z"
 *
 *     VerifyPlayerHistoryRequest:
 *       type: object
 *       required:
 *         - verifiedBy
 *       properties:
 *         verifiedBy:
 *           oneOf:
 *             - type: string
 *             - type: integer
 *           description: Identificador do utilizador responsável pela verificação.
 *           example: 25
 *
 *     PlayerHistory:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *         playerId:
 *           oneOf:
 *             - type: string
 *               format: uuid
 *             - type: integer
 *           description: Identificador do jogador.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *         type:
 *           $ref: '#/components/schemas/PlayerHistoryType'
 *
 *         description:
 *           type: string
 *           example: "Jogador transferido para a equipa principal."
 *
 *         metadata:
 *           type: object
 *           additionalProperties: true
 *           example:
 *             previousTeamId: 10
 *             newTeamId: 15
 *
 *         occurredAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-15T18:30:00.000Z"
 *
 *         isVerified:
 *           type: boolean
 *           example: true
 *
 *         verifiedBy:
 *           oneOf:
 *             - type: string
 *             - type: integer
 *             - type: "null"
 *           example: 25
 *
 *         verifiedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: "2026-09-15T19:00:00.000Z"
 *
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-15T18:35:00.000Z"
 *
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-15T19:00:00.000Z"
 *
 *     PlayerHistoryCreatedResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: ID do histórico criado.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *     PlayerHistoryMessageResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "History verified"
 *
 *     PlayerHistoryValidationError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: VALIDATION_ERROR
 *         message:
 *           type: string
 *           example: Player ID is required
 *
 *     PlayerHistoryError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: INTERNAL_SERVER_ERROR
 *         message:
 *           type: string
 *           example: An unexpected error occurred
 */