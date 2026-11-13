/**
 * @swagger
 * components:
 *   schemas:
 *     HistoryEntry:
 *       type: object
 *       properties:
 *         teamId:
 *           type: integer
 *           nullable: true
 *           example: 5
 *         teamName:
 *           type: string
 *           nullable: true
 *           example: 'Peladeiros FC'
 *         playerId:
 *           type: integer
 *           nullable: true
 *           example: 25
 *         playerName:
 *           type: string
 *           nullable: true
 *           example: 'João Silva'
 *         position:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         type:
 *           type: string
 *           enum: [CHAMPION, RUNNER_UP, THIRD_PLACE, PARTICIPATION, TOP_SCORER, MVP, FAIR_PLAY]
 *           example: CHAMPION
 *         value:
 *           type: number
 *           nullable: true
 *           example: 15
 *         description:
 *           type: string
 *           nullable: true
 *           example: 'Artilheiro do torneio'
 *     TournamentHistory:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         tournamentId:
 *           type: integer
 *           example: 10
 *         tournamentName:
 *           type: string
 *           example: 'Copa Peladeiro 2026'
 *         tournamentType:
 *           type: string
 *           example: LEAGUE
 *         seasonId:
 *           type: integer
 *           nullable: true
 *           example: 2026
 *         seasonName:
 *           type: string
 *           nullable: true
 *           example: 'Temporada 2026'
 *         cityId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         cityName:
 *           type: string
 *           nullable: true
 *           example: 'São Paulo'
 *         championTeamId:
 *           type: integer
 *           nullable: true
 *           example: 5
 *         championTeamName:
 *           type: string
 *           nullable: true
 *           example: 'Peladeiros FC'
 *         runnerUpTeamId:
 *           type: integer
 *           nullable: true
 *           example: 3
 *         runnerUpTeamName:
 *           type: string
 *           nullable: true
 *           example: 'Real Peladeiro'
 *         startedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         finishedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         entries:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/HistoryEntry'
 *         createdAt:
 *           type: string
 *           format: date-time
 */
