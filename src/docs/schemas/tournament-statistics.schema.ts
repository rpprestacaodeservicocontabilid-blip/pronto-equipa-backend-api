/**
 * @swagger
 * components:
 *   schemas:
 *     TournamentStats:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         tournamentId:
 *           type: integer
 *           example: 10
 *         totalMatches:
 *           type: integer
 *           example: 24
 *         totalGoals:
 *           type: integer
 *           example: 68
 *         totalAssists:
 *           type: integer
 *           example: 45
 *         totalYellowCards:
 *           type: integer
 *           example: 32
 *         totalRedCards:
 *           type: integer
 *           example: 3
 *         totalPlayersUsed:
 *           type: integer
 *           example: 85
 *         totalTeams:
 *           type: integer
 *           example: 8
 *         averageGoalsPerMatch:
 *           type: number
 *           format: float
 *           example: 2.83
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     TopScorer:
 *       type: object
 *       properties:
 *         playerId:
 *           type: integer
 *           example: 25
 *         playerName:
 *           type: string
 *           example: 'João Silva'
 *         teamId:
 *           type: integer
 *           example: 5
 *         teamName:
 *           type: string
 *           example: 'Peladeiros FC'
 *         goals:
 *           type: integer
 *           example: 12
 *     TopAssist:
 *       type: object
 *       properties:
 *         playerId:
 *           type: integer
 *           example: 30
 *         playerName:
 *           type: string
 *           example: 'Carlos Souza'
 *         teamId:
 *           type: integer
 *           example: 5
 *         teamName:
 *           type: string
 *           example: 'Peladeiros FC'
 *         assists:
 *           type: integer
 *           example: 8
 */
