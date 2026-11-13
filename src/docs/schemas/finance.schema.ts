/**
 * @swagger
 * components:
 *   schemas:
 *
 *     PaymentProvider:
 *       type: string
 *       description: Provedor utilizado para processar o pagamento.
 *       enum:
 *         - STRIPE
 *         - PAYPAL
 *         - MULTICAIXA
 *       example: MULTICAIXA
 *
 *     WalletOwnerType:
 *       type: string
 *       description: Tipo de entidade proprietária da carteira.
 *       enum:
 *         - FIELD
 *         - REFEREE
 *         - STREAMER
 *         - TEAM
 *         - PLATFORM
 *       example: TEAM
 *
 *     SplitStrategy:
 *       type: string
 *       description: Estratégia utilizada para dividir os custos da partida.
 *       enum:
 *         - single_team
 *         - half_half
 *       example: half_half
 *
 *     CreatePaymentRequest:
 *       type: object
 *       required:
 *         - matchPaymentId
 *         - payerId
 *         - amount
 *         - provider
 *       properties:
 *         matchPaymentId:
 *           type: string
 *           format: uuid
 *           description: Identificador do pagamento associado à partida.
 *           example: 550e8400-e29b-41d4-a716-446655440000
 *
 *         payerId:
 *           type: string
 *           format: uuid
 *           description: Identificador do utilizador responsável pelo pagamento.
 *           example: 7f4a8b9c-1234-4abc-8def-123456789abc
 *
 *         amount:
 *           type: number
 *           format: double
 *           exclusiveMinimum: 0
 *           description: Valor do pagamento.
 *           example: 15000
 *
 *         provider:
 *           $ref: '#/components/schemas/PaymentProvider'
 *
 *     CreateWalletRequest:
 *       type: object
 *       required:
 *         - ownerId
 *         - ownerType
 *       properties:
 *         ownerId:
 *           type: string
 *           format: uuid
 *           description: Identificador do proprietário da carteira.
 *           example: 7f4a8b9c-1234-4abc-8def-123456789abc
 *
 *         ownerType:
 *           $ref: '#/components/schemas/WalletOwnerType'
 *
 *     Wallet:
 *       type: object
 *       description: Carteira financeira associada a uma entidade do Peladeiro.
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Identificador da carteira.
 *           example: 550e8400-e29b-41d4-a716-446655440000
 *
 *         ownerId:
 *           type: string
 *           format: uuid
 *           description: Identificador do proprietário da carteira.
 *           example: 7f4a8b9c-1234-4abc-8def-123456789abc
 *
 *         ownerType:
 *           $ref: '#/components/schemas/WalletOwnerType'
 *
 *         balance:
 *           type: number
 *           format: double
 *           description: Saldo atual da carteira.
 *           example: 45000
 *
 *     WalletBalance:
 *       type: object
 *       description: Saldo atual de uma carteira.
 *       properties:
 *         balance:
 *           type: number
 *           format: double
 *           description: Saldo disponível na carteira.
 *           example: 45000
 *
 *     WalletTransactionRequest:
 *       type: object
 *       required:
 *         - amount
 *       properties:
 *         amount:
 *           type: number
 *           format: double
 *           exclusiveMinimum: 0
 *           description: Valor da operação financeira.
 *           example: 10000
 *
 *     RefundPaymentRequest:
 *       type: object
 *       required:
 *         - amount
 *       properties:
 *         amount:
 *           type: number
 *           format: double
 *           exclusiveMinimum: 0
 *           description: Valor a ser reembolsado.
 *           example: 5000
 *
 *     CreateMatchPaymentRequest:
 *       type: object
 *       required:
 *         - matchId
 *         - fieldFee
 *         - refereeFee
 *         - liveCoverageFee
 *         - platformFee
 *         - splitStrategy
 *         - teamAId
 *       properties:
 *         matchId:
 *           type: string
 *           format: uuid
 *           description: Identificador da partida.
 *           example: 550e8400-e29b-41d4-a716-446655440000
 *
 *         fieldFee:
 *           type: number
 *           format: double
 *           minimum: 0
 *           description: Valor destinado ao pagamento do campo.
 *           example: 15000
 *
 *         refereeFee:
 *           type: number
 *           format: double
 *           minimum: 0
 *           description: Valor destinado à arbitragem.
 *           example: 5000
 *
 *         liveCoverageFee:
 *           type: number
 *           format: double
 *           minimum: 0
 *           description: Valor destinado à cobertura/transmissão da partida.
 *           example: 3000
 *
 *         platformFee:
 *           type: number
 *           format: double
 *           minimum: 0
 *           description: Taxa cobrada pela plataforma.
 *           example: 2000
 *
 *         splitStrategy:
 *           $ref: '#/components/schemas/SplitStrategy'
 *
 *         teamAId:
 *           type: string
 *           format: uuid
 *           description: Identificador da primeira equipa.
 *           example: 7f4a8b9c-1234-4abc-8def-123456789abc
 *
 *         teamBId:
 *           type: string
 *           format: uuid
 *           description: Identificador opcional da segunda equipa.
 *           example: 9c8b7a6f-4321-4abc-8def-987654321abc
 *
 *     Payment:
 *       type: object
 *       description: Registo de um pagamento.
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: 550e8400-e29b-41d4-a716-446655440000
 *
 *         matchPaymentId:
 *           type: string
 *           format: uuid
 *           example: 550e8400-e29b-41d4-a716-446655440001
 *
 *         payerId:
 *           type: string
 *           format: uuid
 *           example: 7f4a8b9c-1234-4abc-8def-123456789abc
 *
 *         amount:
 *           type: number
 *           format: double
 *           example: 15000
 *
 *         provider:
 *           $ref: '#/components/schemas/PaymentProvider'
 *
 *         status:
 *           type: string
 *           description: Estado atual do pagamento.
 *           example: CONFIRMED
 *
 *     MatchPaymentParticipant:
 *       type: object
 *       properties:
 *         teamId:
 *           type: string
 *           description: Identificador da equipa participante.
 *         amountDue:
 *           type: number
 *           format: double
 *           example: 7500
 *         amountPaid:
 *           type: number
 *           format: double
 *           example: 0
 *         status:
 *           type: string
 *           example: pending
 *
 *     MatchPayment:
 *       type: object
 *       description: Pagamento agregado de uma partida.
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         matchId:
 *           type: string
 *         totalAmount:
 *           type: number
 *           format: double
 *         amountPaid:
 *           type: number
 *           format: double
 *         platformFee:
 *           type: number
 *           format: double
 *         fieldFee:
 *           type: number
 *           format: double
 *         refereeFee:
 *           type: number
 *           format: double
 *         liveCoverageFee:
 *           type: number
 *           format: double
 *         splitStrategy:
 *           $ref: '#/components/schemas/SplitStrategy'
 *         participants:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/MatchPaymentParticipant'
 *         status:
 *           type: string
 *           example: pending
 */