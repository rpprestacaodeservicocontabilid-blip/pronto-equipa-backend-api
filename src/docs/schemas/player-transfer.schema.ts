/**
 * @swagger
 * components:
 *   schemas:
 *     TransferContractInput:
 *       type: object
 *       required: [type, startDate]
 *       properties:
 *         type:
 *           type: string
 *           enum: [PERMANENT, LOAN, FREE_AGENT]
 *           example: PERMANENT
 *         startDate:
 *           type: string
 *           format: date-time
 *           example: '2026-10-01T00:00:00.000Z'
 *         endDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         transferFee:
 *           type: number
 *           minimum: 0
 *           example: 15000
 *         salary:
 *           type: number
 *           minimum: 0
 *           example: 2500
 *         notes:
 *           type: string
 *           maxLength: 1000
 *     RequestPlayerTransfer:
 *       type: object
 *       required: [playerId, fromTeamId, toTeamId, contract]
 *       properties:
 *         playerId:
 *           type: integer
 *           minimum: 1
 *           example: 42
 *         fromTeamId:
 *           type: integer
 *           minimum: 1
 *           example: 3
 *         toTeamId:
 *           type: integer
 *           minimum: 1
 *           example: 8
 *         contract:
 *           $ref: '#/components/schemas/TransferContractInput'
 *     TransferActorRequest:
 *       type: object
 *       required: [actorId]
 *       properties:
 *         actorId:
 *           type: integer
 *           minimum: 1
 *           description: Identificador do utilizador que executa a ação.
 *           example: 7
 *     RejectPlayerTransferRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/TransferActorRequest'
 *         - type: object
 *           required: [reason]
 *           properties:
 *             reason:
 *               type: string
 *               minLength: 3
 *               maxLength: 500
 *               example: 'Documentação do contrato incompleta.'
 *     CancelPlayerTransferRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/TransferActorRequest'
 *         - type: object
 *           properties:
 *             reason:
 *               type: string
 *               minLength: 3
 *               maxLength: 500
 *     PlayerTransfer:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 501
 *         playerId:
 *           type: integer
 *           example: 42
 *         fromTeamId:
 *           type: integer
 *           example: 3
 *         toTeamId:
 *           type: integer
 *           example: 8
 *         contract:
 *           $ref: '#/components/schemas/TransferContractInput'
 *         status:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED, EXECUTED, CANCELLED]
 *           example: PENDING
 *         createdAt:
 *           type: string
 *           format: date-time
 */
