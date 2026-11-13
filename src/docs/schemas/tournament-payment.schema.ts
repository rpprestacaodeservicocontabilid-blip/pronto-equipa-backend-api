/**
 * @swagger
 * components:
 *   schemas:
 *     CreateTournamentPayment:
 *       type: object
 *       required: [tournamentId, teamId, type, amount, currency]
 *       properties:
 *         tournamentId:
 *           type: integer
 *           minimum: 1
 *           example: 10
 *         teamId:
 *           type: integer
 *           minimum: 1
 *           example: 5
 *         registrationId:
 *           type: integer
 *           nullable: true
 *           example: 20
 *         type:
 *           type: string
 *           enum: [REGISTRATION, ENTRY_FEE, TOURNAMENT_FEE, PENALTY, REFUND]
 *           example: REGISTRATION
 *         amount:
 *           type: number
 *           minimum: 0.01
 *           example: 150.00
 *         currency:
 *           type: string
 *           minLength: 3
 *           maxLength: 3
 *           example: 'BRL'
 *     TournamentPayment:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 100
 *         tournamentId:
 *           type: integer
 *           example: 10
 *         teamId:
 *           type: integer
 *           example: 5
 *         registrationId:
 *           type: integer
 *           nullable: true
 *           example: 20
 *         paymentId:
 *           type: integer
 *           nullable: true
 *           example: 500
 *         type:
 *           type: string
 *           enum: [REGISTRATION, ENTRY_FEE, TOURNAMENT_FEE, PENALTY, REFUND]
 *           example: REGISTRATION
 *         status:
 *           type: string
 *           enum: [PENDING, PROCESSING, PAID, FAILED, CANCELLED, REFUNDED]
 *           example: PAID
 *         amount:
 *           type: number
 *           example: 150.00
 *         currency:
 *           type: string
 *           example: 'BRL'
 *         reference:
 *           type: string
 *           nullable: true
 *           example: 'PAY-2026-001'
 *         paidAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         refundedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 */
