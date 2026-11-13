/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterCard:
 *       type: object
 *       required: [tournamentId, matchId, playerId, teamId, cardType]
 *       properties:
 *         tournamentId:
 *           type: integer
 *           minimum: 1
 *           example: 10
 *         matchId:
 *           type: integer
 *           minimum: 1
 *           example: 50
 *         playerId:
 *           type: integer
 *           minimum: 1
 *           example: 25
 *         teamId:
 *           type: integer
 *           minimum: 1
 *           example: 5
 *         cardType:
 *           type: string
 *           enum: [YELLOW, RED]
 *           example: YELLOW
 *         minute:
 *           type: integer
 *           nullable: true
 *           example: 35
 *         reason:
 *           type: string
 *           nullable: true
 *           example: 'Falta tática'
 *     SuspendPlayer:
 *       type: object
 *       required: [tournamentId, playerId, matches, reason]
 *       properties:
 *         tournamentId:
 *           type: integer
 *           minimum: 1
 *           example: 10
 *         playerId:
 *           type: integer
 *           minimum: 1
 *           example: 25
 *         matches:
 *           type: integer
 *           minimum: 1
 *           example: 3
 *         reason:
 *           type: string
 *           example: 'Acumulação de cartões amarelos'
 *         disciplineId:
 *           type: integer
 *           nullable: true
 *           example: 5
 *     LiftSuspension:
 *       type: object
 *       required: [disciplineId, tournamentId, playerId]
 *       properties:
 *         disciplineId:
 *           type: integer
 *           minimum: 1
 *           example: 5
 *         tournamentId:
 *           type: integer
 *           minimum: 1
 *           example: 10
 *         playerId:
 *           type: integer
 *           minimum: 1
 *           example: 25
 *         reason:
 *           type: string
 *           nullable: true
 *           example: 'Suspensão cumprida'
 *     ApplyPenalty:
 *       type: object
 *       required: [tournamentId, reason]
 *       properties:
 *         tournamentId:
 *           type: integer
 *           minimum: 1
 *           example: 10
 *         playerId:
 *           type: integer
 *           nullable: true
 *           example: 25
 *         teamId:
 *           type: integer
 *           nullable: true
 *           example: 5
 *         disciplineId:
 *           type: integer
 *           nullable: true
 *           example: 5
 *         reason:
 *           type: string
 *           example: 'Penalidade por conduta antidesportiva'
 *         amount:
 *           type: number
 *           nullable: true
 *           example: 50.00
 *     Discipline:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 100
 *         tournamentId:
 *           type: integer
 *           example: 10
 *         playerId:
 *           type: integer
 *           nullable: true
 *           example: 25
 *         teamId:
 *           type: integer
 *           nullable: true
 *           example: 5
 *         matchId:
 *           type: integer
 *           nullable: true
 *           example: 50
 *         type:
 *           type: string
 *           enum: [CARD, SUSPENSION, PENALTY]
 *           example: CARD
 *         cardType:
 *           type: string
 *           enum: [YELLOW, RED]
 *           nullable: true
 *           example: YELLOW
 *         reason:
 *           type: string
 *           nullable: true
 *         matchesRemaining:
 *           type: integer
 *           example: 3
 *         status:
 *           type: string
 *           enum: [ACTIVE, COMPLETED, LIFTED, CANCELLED]
 *           example: ACTIVE
 *         issuedAt:
 *           type: string
 *           format: date-time
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         liftedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
