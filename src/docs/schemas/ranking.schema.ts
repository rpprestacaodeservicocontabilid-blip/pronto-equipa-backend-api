/**
 * @swagger
 * components:
 *   schemas:
 *     RankingEntry:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         teamId:
 *           type: integer
 *           example: 5
 *         tournamentId:
 *           type: integer
 *           example: 10
 *         cityId:
 *           type: integer
 *           example: 3
 *         played:
 *           type: integer
 *           example: 12
 *         wins:
 *           type: integer
 *           example: 8
 *         draws:
 *           type: integer
 *           example: 2
 *         losses:
 *           type: integer
 *           example: 2
 *         goalsFor:
 *           type: integer
 *           example: 25
 *         goalsAgainst:
 *           type: integer
 *           example: 10
 *         goalDifference:
 *           type: integer
 *           example: 15
 *         points:
 *           type: integer
 *           example: 26
 *         isActive:
 *           type: boolean
 *           example: true
 *     TeamRankingPosition:
 *       type: object
 *       properties:
 *         position:
 *           type: integer
 *           example: 3
 *         ranking:
 *           $ref: '#/components/schemas/RankingEntry'
 */
