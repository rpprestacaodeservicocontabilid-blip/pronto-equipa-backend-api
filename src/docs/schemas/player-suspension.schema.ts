/**
 * @swagger
 * components:
 *   schemas:
 *
 *     PlayerSuspensionType:
 *       type: string
 *       description: Tipo de suspensão aplicada ao jogador.
 *       example: DISCIPLINARY
 *
 *     CreatePlayerSuspensionRequest:
 *       type: object
 *       required:
 *         - playerId
 *         - type
 *         - reason
 *         - numberOfMatches
 *         - issuedBy
 *       properties:
 *         playerId:
 *           oneOf:
 *             - type: string
 *             - type: number
 *           description: Identificador do jogador suspenso.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *         type:
 *           $ref: '#/components/schemas/PlayerSuspensionType'
 *
 *         reason:
 *           type: string
 *           minLength: 3
 *           maxLength: 500
 *           description: Motivo da suspensão.
 *           example: "Comportamento antidesportivo durante a partida."
 *
 *         startDate:
 *           type: string
 *           format: date-time
 *           description: Data de início da suspensão. Não pode estar no futuro.
 *           example: "2026-09-15T18:30:00.000Z"
 *
 *         endDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Data prevista para o fim da suspensão.
 *           example: "2026-10-15T18:30:00.000Z"
 *
 *         numberOfMatches:
 *           type: integer
 *           minimum: 1
 *           description: Número de partidas de suspensão.
 *           example: 3
 *
 *         issuedBy:
 *           oneOf:
 *             - type: string
 *             - type: number
 *           description: Identificador de quem aplicou a suspensão.
 *           example: "admin-123"
 *
 *     ServePlayerSuspensionRequest:
 *       type: object
 *       properties:
 *         matches:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *           description: Número de partidas cumpridas nesta operação.
 *           example: 1
 *
 *     PlayerSuspension:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Identificador único da suspensão.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *         playerId:
 *           oneOf:
 *             - type: string
 *             - type: number
 *           description: Identificador do jogador.
 *           example: "player-123"
 *
 *         type:
 *           $ref: '#/components/schemas/PlayerSuspensionType'
 *
 *         reason:
 *           type: string
 *           description: Motivo da suspensão.
 *           example: "Comportamento antidesportivo."
 *
 *         startDate:
 *           type: string
 *           format: date-time
 *           example: "2026-09-15T18:30:00.000Z"
 *
 *         endDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: "2026-10-15T18:30:00.000Z"
 *
 *         numberOfMatches:
 *           type: integer
 *           example: 3
 *
 *         issuedBy:
 *           oneOf:
 *             - type: string
 *             - type: number
 *           example: "admin-123"
 *
 *         isActive:
 *           type: boolean
 *           example: true
 *
 *         matchesServed:
 *           type: integer
 *           example: 1
 *
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-15T18:35:00.000Z"
 *
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-16T10:00:00.000Z"
 *
 *     PlayerSuspensionCreatedResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: ID da suspensão criada.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *     PlayerSuspensionMessageResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: Suspension lifted
 *
 *     PlayerSuspensionList:
 *       type: array
 *       items:
 *         $ref: '#/components/schemas/PlayerSuspension'
 *
 *     PlayerSuspensionCheckResponse:
 *       type: object
 *       properties:
 *         suspension:
 *           nullable: true
 *           allOf:
 *             - $ref: '#/components/schemas/PlayerSuspension'
 *           description: Suspensão ativa encontrada para o jogador, ou null caso não exista.
 *
 *     PlayerSuspensionValidationError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: VALIDATION_ERROR
 *         message:
 *           type: string
 *           example: Validation error
 *
 *     PlayerSuspensionError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: INTERNAL_SERVER_ERROR
 *         message:
 *           type: string
 *           example: An unexpected error occurred
 */