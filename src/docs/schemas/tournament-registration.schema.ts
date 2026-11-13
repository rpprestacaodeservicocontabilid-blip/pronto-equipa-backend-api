/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterTeam:
 *       type: object
 *       required: [tournamentId, teamId]
 *       properties:
 *         tournamentId:
 *           type: integer
 *           minimum: 1
 *           example: 10
 *         teamId:
 *           type: integer
 *           minimum: 1
 *           example: 5
 *     RejectRegistration:
 *       type: object
 *       required: [reason]
 *       properties:
 *         reason:
 *           type: string
 *           minLength: 3
 *           example: 'Documentação incompleta'
 *     TournamentRegistration:
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
 *         status:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED, CANCELLED, REMOVED]
 *           example: PENDING
 *         registeredAt:
 *           type: string
 *           format: date-time
 *         approvedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         rejectedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         rejectionReason:
 *           type: string
 *           nullable: true
 *           example: 'Documentação incompleta'
 */
