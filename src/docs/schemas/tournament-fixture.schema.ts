/**
 * @swagger
 * components:
 *   schemas:
 *     GenerateFixtures:
 *       type: object
 *       required: [tournamentId, teamIds]
 *       properties:
 *         tournamentId:
 *           type: integer
 *           minimum: 1
 *           example: 10
 *         teamIds:
 *           type: array
 *           items:
 *             type: integer
 *           minimum: 1
 *           example: [1, 2, 3, 4]
 *     Fixture:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 100
 *         tournamentId:
 *           type: integer
 *           example: 10
 *         homeTeamId:
 *           type: integer
 *           example: 1
 *         awayTeamId:
 *           type: integer
 *           example: 2
 *         type:
 *           type: string
 *           enum: [LEAGUE, KNOCKOUT, GROUP_STAGE, ROUND_ROBIN, FRIENDLY]
 *           example: LEAGUE
 *         date:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         startTime:
 *           type: string
 *           nullable: true
 *           example: '15:00'
 *         endTime:
 *           type: string
 *           nullable: true
 *           example: '16:30'
 *         fieldId:
 *           type: integer
 *           nullable: true
 *           example: 3
 *         homeScore:
 *           type: integer
 *           nullable: true
 *           example: 2
 *         awayScore:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         isPlayed:
 *           type: boolean
 *           example: true
 *         isPublished:
 *           type: boolean
 *           example: true
 *         isLocked:
 *           type: boolean
 *           example: false
 *         isCancelled:
 *           type: boolean
 *           example: false
 *         createdAt:
 *           type: string
 *           format: date-time
 */
