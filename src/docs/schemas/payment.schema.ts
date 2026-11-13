/**
 * @swagger
 * components:
 *   schemas:
 *
 *     CreatePaymentRequest:
 *       type: object
 *       required:
 *         - userId
 *         - amount
 *         - method
 *         - type
 *       properties:
 *         userId:
 *           type: integer
 *           description: ID do utilizador associado ao pagamento.
 *           example: 15
 *         amount:
 *           type: number
 *           format: double
 *           description: Valor do pagamento.
 *           example: 15000
 *         method:
 *           type: string
 *           description: Método de pagamento.
 *           example: "UNITEL_MONEY"
 *         type:
 *           type: string
 *           description: Tipo/finalidade do pagamento.
 *           example: "BOOKING"
 *         bookingId:
 *           type: integer
 *           nullable: true
 *           description: ID da reserva associada ao pagamento.
 *           example: 42
 *         matchId:
 *           type: integer
 *           nullable: true
 *           description: ID da partida associada ao pagamento.
 *           example: 10
 *         tournamentId:
 *           type: integer
 *           nullable: true
 *           description: ID do torneio associado ao pagamento.
 *           example: 5
 *
 *     PaymentQuery:
 *       type: object
 *       properties:
 *         userId:
 *           type: string
 *           description: Filtra pagamentos por utilizador.
 *           example: "15"
 *         status:
 *           type: string
 *           description: Filtra pagamentos pelo estado.
 *           example: "COMPLETED"
 *         type:
 *           type: string
 *           description: Filtra pagamentos pelo tipo.
 *           example: "BOOKING"
 *         page:
 *           type: string
 *           description: Número da página.
 *           example: "1"
 *         limit:
 *           type: string
 *           description: Quantidade de registos por página.
 *           example: "20"
 *
 *     RefundPaymentRequest:
 *       type: object
 *       required:
 *         - amount
 *       properties:
 *         amount:
 *           type: number
 *           format: double
 *           description: Valor a ser reembolsado.
 *           example: 15000
 *         reason:
 *           type: string
 *           description: Motivo do reembolso.
 *           example: "Reserva cancelada pelo utilizador."
 *
 *     Payment:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 100
 *         userId:
 *           type: integer
 *           example: 15
 *         cityId:
 *           type: integer
 *           example: 1
 *         teamId:
 *           type: integer
 *           nullable: true
 *           example: 7
 *         tournamentId:
 *           type: integer
 *           nullable: true
 *           example: 5
 *         matchId:
 *           type: integer
 *           nullable: true
 *           example: 10
 *         amount:
 *           type: number
 *           format: double
 *           example: 15000
 *         currency:
 *           type: string
 *           example: "AOA"
 *         status:
 *           type: string
 *           example: "COMPLETED"
 *         method:
 *           type: string
 *           example: "UNITEL_MONEY"
 *         reference:
 *           type: string
 *           example: "PAY-20260930-00125"
 *         metadata:
 *           nullable: true
 *           description: Metadados adicionais associados ao pagamento.
 *           example:
 *             bookingId: 42
 *             providerReference: "TX123456"
 *
 *     Refund:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 20
 *         paymentId:
 *           type: integer
 *           example: 100
 *         amount:
 *           type: number
 *           format: double
 *           example: 15000
 *         reason:
 *           type: string
 *           nullable: true
 *           example: "Reserva cancelada pelo utilizador."
 *         status:
 *           type: string
 *           example: "COMPLETED"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-30T15:30:00.000Z"
 *
 *     PaymentTransaction:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 50
 *         paymentId:
 *           type: integer
 *           example: 100
 *         gateway:
 *           type: string
 *           example: "UNITEL_MONEY"
 *         transactionId:
 *           type: string
 *           example: "TX-123456789"
 *         amount:
 *           type: number
 *           format: double
 *           example: 15000
 *         status:
 *           type: string
 *           example: "SUCCESS"
 *         rawResponse:
 *           type: object
 *           nullable: true
 *           additionalProperties: true
 *           description: Resposta original recebida do gateway.
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-30T15:25:00.000Z"
 *
 *     PaymentList:
 *       type: object
 *       additionalProperties: true
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Payment'
 *         page:
 *           type: integer
 *           example: 1
 *         limit:
 *           type: integer
 *           example: 20
 *         total:
 *           type: integer
 *           example: 45
 *
 *     PaymentWebhookResponse:
 *       type: object
 *       required:
 *         - received
 *       properties:
 *         received:
 *           type: boolean
 *           example: true
 *
 *     PaymentErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: "Payment not found."
 */