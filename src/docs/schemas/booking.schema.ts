/**
 * @swagger
 * components:
 *   schemas:
 *
 *     BookingStatus:
 *       type: string
 *       description: Estado atual da reserva.
 *       enum:
 *         - PENDING
 *         - CONFIRMED
 *         - CANCELLED
 *         - COMPLETED
 *         - EXPIRED
 *       example: PENDING
 *
 *     CreateBookingRequest:
 *       type: object
 *       required:
 *         - fieldId
 *         - userId
 *         - cityId
 *         - startTime
 *         - endTime
 *         - hourlyRate
 *       properties:
 *         fieldId:
 *           type: integer
 *           minimum: 1
 *           description: ID do campo de futebol que será reservado.
 *           example: 7
 *
 *         userId:
 *           type: integer
 *           minimum: 1
 *           description: ID do utilizador responsável pela reserva.
 *           example: 15
 *
 *         cityId:
 *           type: integer
 *           minimum: 1
 *           description: ID da cidade onde o campo está localizado.
 *           example: 1
 *
 *         startTime:
 *           type: string
 *           format: date-time
 *           description: Data e hora de início da reserva.
 *           example: 2026-10-05T18:00:00.000Z
 *
 *         endTime:
 *           type: string
 *           format: date-time
 *           description: Data e hora de término da reserva.
 *           example: 2026-10-05T19:00:00.000Z
 *
 *         hourlyRate:
 *           type: number
 *           format: double
 *           exclusiveMinimum: 0
 *           description: Valor cobrado por hora pela utilização do campo.
 *           example: 15000
 *
 *     BookingQuery:
 *       type: object
 *       properties:
 *         userId:
 *           type: integer
 *           minimum: 1
 *           description: Filtra as reservas pelo ID do utilizador.
 *           example: 15
 *
 *         fieldId:
 *           type: integer
 *           minimum: 1
 *           description: Filtra as reservas pelo ID do campo.
 *           example: 7
 *
 *         status:
 *           $ref: '#/components/schemas/BookingStatus'
 *
 *     Booking:
 *       type: object
 *       description: Dados de uma reserva de campo de futebol.
 *       properties:
 *         id:
 *           type: integer
 *           minimum: 1
 *           description: ID da reserva.
 *           example: 123
 *
 *         fieldId:
 *           type: integer
 *           minimum: 1
 *           description: ID do campo reservado.
 *           example: 7
 *
 *         userId:
 *           type: integer
 *           minimum: 1
 *           description: ID do utilizador responsável pela reserva.
 *           example: 15
 *
 *         cityId:
 *           type: integer
 *           minimum: 1
 *           description: ID da cidade associada à reserva.
 *           example: 1
 *
 *         startTime:
 *           type: string
 *           format: date-time
 *           description: Data e hora de início da reserva.
 *           example: 2026-10-05T18:00:00.000Z
 *
 *         endTime:
 *           type: string
 *           format: date-time
 *           description: Data e hora de término da reserva.
 *           example: 2026-10-05T19:00:00.000Z
 *
 *         hourlyRate:
 *           type: number
 *           format: double
 *           description: Valor cobrado por hora.
 *           example: 15000
 *
 *         status:
 *           $ref: '#/components/schemas/BookingStatus'
 */
