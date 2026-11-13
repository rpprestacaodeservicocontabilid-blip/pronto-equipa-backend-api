/**
 * @swagger
 * components:
 *   schemas:
 *     TournamentRulesInput:
 *       type: object
 *       required: [minTeams, maxTeams, allowDraws, pointsPerWin, pointsPerDraw, pointsPerLoss]
 *       properties:
 *         minTeams:
 *           type: integer
 *           minimum: 2
 *           example: 4
 *         maxTeams:
 *           type: integer
 *           minimum: 2
 *           example: 16
 *         allowDraws:
 *           type: boolean
 *           example: true
 *         pointsPerWin:
 *           type: number
 *           example: 3
 *         pointsPerDraw:
 *           type: number
 *           example: 1
 *         pointsPerLoss:
 *           type: number
 *           example: 0
 *     CreateTournament:
 *       type: object
 *       required: [name, type, startDate, endDate, rules]
 *       properties:
 *         name:
 *           type: string
 *           example: 'Copa Peladeiro 2026'
 *         description:
 *           type: string
 *           nullable: true
 *           example: 'Torneio de futebol amador'
 *         type:
 *           type: string
 *           enum: [LEAGUE, KNOCKOUT, GROUP_STAGE, ROUND_ROBIN, FRIENDLY, SWISS]
 *           example: LEAGUE
 *         modalityId:
 *           type: integer
 *           nullable: true
 *           description: Modalidade principal associada ao torneio.
 *           example: 1
 *         cityId:
 *           type: integer
 *           nullable: true
 *           description: Cidade do torneio.
 *           example: 4
 *         organizerId:
 *           type: integer
 *           description: ID de um utilizador organizador ativo. Se omitido, usa o utilizador autenticado.
 *           example: 12
 *         startDate:
 *           type: string
 *           format: date-time
 *           example: '2026-10-01T00:00:00.000Z'
 *         endDate:
 *           type: string
 *           format: date-time
 *           example: '2026-12-31T00:00:00.000Z'
 *         rules:
 *           $ref: '#/components/schemas/TournamentRulesInput'
 *     UpdateTournament:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: 'Copa Peladeiro 2026'
 *         description:
 *           type: string
 *           nullable: true
 *           example: 'Descrição atualizada'
 *     Tournament:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: 'Copa Peladeiro 2026'
 *         description:
 *           type: string
 *           nullable: true
 *         type:
 *           type: string
 *           enum: [LEAGUE, KNOCKOUT, GROUP_STAGE, ROUND_ROBIN, FRIENDLY, SWISS]
 *           example: LEAGUE
 *         modalityId:
 *           type: integer
 *           nullable: true
 *         cityId:
 *           type: integer
 *           nullable: true
 *         organizerId:
 *           type: integer
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [DRAFT, REGISTRATION_OPEN, REGISTRATION_CLOSED, IN_PROGRESS, SUSPENDED, FINISHED, CANCELLED]
 *           example: DRAFT
 *         startDate:
 *           type: string
 *           format: date-time
 *         endDate:
 *           type: string
 *           format: date-time
 *         rules:
 *           $ref: '#/components/schemas/TournamentRulesInput'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */
