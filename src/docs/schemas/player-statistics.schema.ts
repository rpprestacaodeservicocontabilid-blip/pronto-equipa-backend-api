/**
 * @swagger
 * components:
 *   schemas:
 *
 *     PlayerStatisticsMetric:
 *       type: string
 *       description: Métrica estatística associada ao jogador.
 *       example: goals
 *
 *     CreatePlayerStatisticsRequest:
 *       type: object
 *       required:
 *         - playerId
 *         - matchId
 *         - metric
 *         - value
 *       properties:
 *         playerId:
 *           oneOf:
 *             - type: string
 *             - type: number
 *           description: Identificador do jogador.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *         matchId:
 *           oneOf:
 *             - type: string
 *             - type: number
 *           description: Identificador da partida.
 *           example: "660e8400-e29b-41d4-a716-446655440000"
 *
 *         metric:
 *           $ref: '#/components/schemas/PlayerStatisticsMetric'
 *
 *         value:
 *           type: number
 *           minimum: 0
 *           description: Valor da estatística. Não pode ser negativo.
 *           example: 3
 *
 *         recordedAt:
 *           type: string
 *           format: date-time
 *           description: Data e hora em que a estatística foi registada. Não pode estar no futuro.
 *           example: "2026-09-15T18:30:00.000Z"
 *
 *         notes:
 *           type: string
 *           maxLength: 1000
 *           description: Observações adicionais sobre a estatística.
 *           example: "Estatística registada após revisão da partida."
 *
 *     VerifyPlayerStatisticsRequest:
 *       type: object
 *       required:
 *         - verifiedBy
 *       properties:
 *         verifiedBy:
 *           oneOf:
 *             - type: string
 *             - type: number
 *           description: Identificador do utilizador que verificou a estatística.
 *           example: "admin-123"
 *
 *     PlayerStatistics:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Identificador único da estatística.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *         playerId:
 *           oneOf:
 *             - type: string
 *             - type: number
 *           description: Identificador do jogador.
 *           example: "player-123"
 *
 *         matchId:
 *           oneOf:
 *             - type: string
 *             - type: number
 *           description: Identificador da partida.
 *           example: "match-456"
 *
 *         metric:
 *           $ref: '#/components/schemas/PlayerStatisticsMetric'
 *
 *         value:
 *           type: number
 *           description: Valor registado para a métrica.
 *           example: 3
 *
 *         recordedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-15T18:30:00.000Z"
 *
 *         isVerified:
 *           type: boolean
 *           example: true
 *
 *         verifiedBy:
 *           nullable: true
 *           oneOf:
 *             - type: string
 *             - type: number
 *           example: "admin-123"
 *
 *         verifiedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: "2026-09-15T19:00:00.000Z"
 *
 *         notes:
 *           type: string
 *           example: "Estatística confirmada."
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
 *     PlayerStatisticsCreatedResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: ID da estatística criada.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *     PlayerStatisticsMessageResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: Statistics verified
 *
 *     PlayerStatisticsList:
 *       type: array
 *       items:
 *         $ref: '#/components/schemas/PlayerStatistics'
 *
 *     PlayerStatisticsValidationError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: VALIDATION_ERROR
 *         message:
 *           type: string
 *           example: Validation error
 *
 *     PlayerStatisticsError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: INTERNAL_SERVER_ERROR
 *         message:
 *           type: string
 *           example: An unexpected error occurred
 */
