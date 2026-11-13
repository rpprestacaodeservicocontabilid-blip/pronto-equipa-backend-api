/**
 * @swagger
 * components:
 *   schemas:
 *     CreateAward:
 *       type: object
 *       required: [tournamentId, type]
 *       properties:
 *         tournamentId:
 *           type: integer
 *           minimum: 1
 *           example: 10
 *         type:
 *           type: string
 *           enum: [CHAMPION, RUNNER_UP, THIRD_PLACE, MVP, TOP_SCORER, TOP_ASSIST, BEST_GOALKEEPER, BEST_DEFENDER, BEST_ATTACKER, FAIR_PLAY, BEST_PLAYER, BEST_TEAM]
 *           example: MVP
 *         playerId:
 *           type: integer
 *           minimum: 1
 *           nullable: true
 *           example: 25
 *         teamId:
 *           type: integer
 *           minimum: 1
 *           nullable: true
 *           example: 5
 *         position:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         score:
 *           type: number
 *           nullable: true
 *           example: 8.5
 *         description:
 *           type: string
 *           nullable: true
 *           example: 'Melhor jogador do torneio'
 *     Award:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 100
 *         tournamentId:
 *           type: integer
 *           example: 10
 *         type:
 *           type: string
 *           enum: [CHAMPION, RUNNER_UP, THIRD_PLACE, MVP, TOP_SCORER, TOP_ASSIST, BEST_GOALKEEPER, BEST_DEFENDER, BEST_ATTACKER, FAIR_PLAY, BEST_PLAYER, BEST_TEAM]
 *           example: MVP
 *         playerId:
 *           type: integer
 *           nullable: true
 *           example: 25
 *         teamId:
 *           type: integer
 *           nullable: true
 *           example: null
 *         position:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         score:
 *           type: number
 *           nullable: true
 *           example: 8.5
 *         description:
 *           type: string
 *           nullable: true
 *         assignedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
