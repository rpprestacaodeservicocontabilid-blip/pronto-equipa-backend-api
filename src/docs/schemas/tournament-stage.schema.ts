/**
 * @swagger
 * components:
 *   schemas:
 *     StageRuleInput:
 *       type: object
 *       required: [matchesPerTeam, qualifiedTeams, elimination, homeAndAway, pointsForWin, pointsForDraw, pointsForLoss, allowDraw]
 *       properties:
 *         matchesPerTeam:
 *           type: integer
 *           minimum: 1
 *           example: 2
 *         qualifiedTeams:
 *           type: integer
 *           minimum: 1
 *           example: 4
 *         elimination:
 *           type: boolean
 *           example: false
 *         homeAndAway:
 *           type: boolean
 *           example: true
 *         pointsForWin:
 *           type: number
 *           example: 3
 *         pointsForDraw:
 *           type: number
 *           example: 1
 *         pointsForLoss:
 *           type: number
 *           example: 0
 *         allowDraw:
 *           type: boolean
 *           example: true
 *     CreateStage:
 *       type: object
 *       required: [tournamentId, name, type, order, rule]
 *       properties:
 *         tournamentId:
 *           type: integer
 *           minimum: 1
 *           example: 10
 *         name:
 *           type: string
 *           example: 'Fase de Grupos'
 *         type:
 *           type: string
 *           enum: [GROUP, LEAGUE, ROUND_ROBIN, KNOCKOUT, QUARTER_FINAL, SEMI_FINAL, FINAL, THIRD_PLACE, SWISS]
 *           example: GROUP
 *         order:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *         rule:
 *           $ref: '#/components/schemas/StageRuleInput'
 *     Stage:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         tournamentId:
 *           type: integer
 *           example: 10
 *         name:
 *           type: string
 *           example: 'Fase de Grupos'
 *         type:
 *           type: string
 *           enum: [GROUP, LEAGUE, ROUND_ROBIN, KNOCKOUT, QUARTER_FINAL, SEMI_FINAL, FINAL, THIRD_PLACE, SWISS]
 *           example: GROUP
 *         order:
 *           type: integer
 *           example: 1
 *         status:
 *           type: string
 *           enum: [PENDING, ACTIVE, COMPLETED, CANCELLED]
 *           example: ACTIVE
 *         rule:
 *           $ref: '#/components/schemas/StageRuleInput'
 *         startedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         completedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 */
