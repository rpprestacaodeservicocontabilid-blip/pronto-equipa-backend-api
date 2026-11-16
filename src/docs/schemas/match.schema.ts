/**
 * @swagger
 * components:
 *   schemas:
 *     MatchStatus:
 *       type: string
 *       description: Estado atual da partida.
 *       enum:
 *         - SCHEDULED
 *         - LIVE
 *         - FINISHED
 *         - CANCELLED
 *       example: SCHEDULED
 *
 *     CreateMatchRequest:
 *       type: object
 *       required:
 *         - homeTeamId
 *         - awayTeamId
 *         - fieldId
 *         - cityId
 *         - matchDate
 *       properties:
 *         homeTeamId:
 *           type: integer
 *           description: ID do time mandante.
 *           example: 1
 *         awayTeamId:
 *           type: integer
 *           description: ID do time visitante.
 *           example: 2
 *         fieldId:
 *           type: integer
 *           description: ID do campo onde a partida será realizada.
 *           example: 10
 *         cityId:
 *           type: integer
 *           description: ID da cidade da partida.
 *           example: 5
 *         tournamentId:
 *           type: integer
 *           nullable: true
 *           description: ID opcional do torneio ao qual a partida pertence.
 *           example: 3
 *         matchDate:
 *           type: string
 *           format: date-time
 *           description: Data e hora agendadas para a partida.
 *           example: "2026-10-15T18:00:00.000Z"
 *
 *     ScheduleMatchesRequest:
 *       type: object
 *       required:
 *         - teamIds
 *         - fieldId
 *         - cityId
 *       properties:
 *         teamIds:
 *           type: array
 *           description: IDs dos times envolvidos no agendamento.
 *           minItems: 1
 *           items:
 *             type: integer
 *           example: [1, 2]
 *         fieldId:
 *           type: integer
 *           description: ID do campo onde as partidas serão realizadas.
 *           example: 10
 *         cityId:
 *           type: integer
 *           description: ID da cidade.
 *           example: 5
 *
 *     UpdateScoreRequest:
 *       type: object
 *       required:
 *         - homeScore
 *         - awayScore
 *       properties:
 *         homeScore:
 *           type: integer
 *           minimum: 0
 *           description: Gols marcados pelo time mandante.
 *           example: 3
 *         awayScore:
 *           type: integer
 *           minimum: 0
 *           description: Gols marcados pelo time visitante.
 *           example: 1
 *
 *     RescheduleMatchRequest:
 *       type: object
 *       required:
 *         - matchDate
 *       properties:
 *         matchDate:
 *           type: string
 *           format: date-time
 *           description: Nova data e hora da partida.
 *           example: "2026-10-20T19:30:00.000Z"
 *
 *     Match:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 15
 *         homeTeamId:
 *           type: integer
 *           example: 1
 *         awayTeamId:
 *           type: integer
 *           example: 2
 *         fieldId:
 *           type: integer
 *           example: 10
 *         tournamentId:
 *           type: integer
 *           nullable: true
 *           example: 3
 *         cityId:
 *           type: integer
 *           example: 5
 *         matchDate:
 *           type: string
 *           format: date-time
 *           example: "2026-10-15T18:00:00.000Z"
 *         status:
 *           $ref: '#/components/schemas/MatchStatus'
 *         homeScore:
 *           type: integer
 *           minimum: 0
 *           nullable: true
 *           example: 3
 *         awayScore:
 *           type: integer
 *           minimum: 0
 *           nullable: true
 *           example: 1
 *         isActive:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-30T10:00:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-30T12:00:00.000Z"
 *
 *     MatchList:
 *       type: array
 *       items:
 *         $ref: '#/components/schemas/Match'
 *
 *     MatchStatistics:
 *       type: object
 *       description: Estatísticas agregadas das partidas.
 *       additionalProperties: true
 *       example:
 *         total: 120
 *         scheduled: 40
 *         live: 5
 *         finished: 70
 *         cancelled: 5
 */
