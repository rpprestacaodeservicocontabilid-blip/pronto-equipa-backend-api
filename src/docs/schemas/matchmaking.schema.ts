/**
 * @swagger
 * components:
 *   schemas:
 *
 *     FindMatchRequest:
 *       type: object
 *       required:
 *         - teamId
 *       properties:
 *         teamId:
 *           type: integer
 *           description: ID do time que pretende encontrar um adversário.
 *           example: 12
 *
 *     RecommendationQuery:
 *       type: object
 *       properties:
 *         teamId:
 *           type: integer
 *           description: ID do time para o qual as recomendações serão obtidas.
 *           example: 12
 *
 *     MatchmakingMatch:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID da solicitação ou partida de matchmaking.
 *           example: 45
 *         requestId:
 *           type: integer
 *           description: ID da solicitação de matchmaking relacionada.
 *           example: 20
 *         homeTeamId:
 *           type: integer
 *           description: ID do time mandante.
 *           example: 12
 *         awayTeamId:
 *           type: integer
 *           description: ID do time adversário.
 *           example: 18
 *         fieldId:
 *           type: integer
 *           nullable: true
 *           description: ID do campo associado à partida.
 *           example: 7
 *         cityId:
 *           type: integer
 *           nullable: true
 *           description: ID da cidade onde a partida será realizada.
 *           example: 3
 *         matchDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Data e hora previstas para a partida.
 *           example: "2026-10-15T18:00:00.000Z"
 *         status:
 *           type: string
 *           enum:
 *             - SCHEDULED
 *             - LIVE
 *             - FINISHED
 *             - CANCELLED
 *           example: SCHEDULED
 *         homeScore:
 *           type: integer
 *           nullable: true
 *           minimum: 0
 *           example: 0
 *         awayScore:
 *           type: integer
 *           nullable: true
 *           minimum: 0
 *           example: 0
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-30T10:00:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-30T10:00:00.000Z"
 *
 *     MatchmakingMatchList:
 *       type: array
 *       items:
 *         $ref: '#/components/schemas/MatchmakingMatch'
 */