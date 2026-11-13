/**
 * @swagger
 * components:
 *   schemas:
 *
 *     Field:
 *       type: object
 *       description: Campo de futebol disponível na plataforma Peladeiro.
 *       properties:
 *         id:
 *           type: integer
 *           minimum: 1
 *           description: Identificador único do campo.
 *           example: 1
 *
 *         name:
 *           type: string
 *           description: Nome do campo.
 *           example: Campo do Kilamba
 *
 *         address:
 *           type: string
 *           description: Endereço físico do campo.
 *           example: Avenida 21 de Janeiro, Kilamba, Luanda
 *
 *         cityId:
 *           type: integer
 *           minimum: 1
 *           description: ID da cidade onde o campo está localizado.
 *           example: 1
 *
 *         pricePerHour:
 *           type: number
 *           format: double
 *           exclusiveMinimum: 0
 *           description: Preço cobrado por hora pela utilização do campo.
 *           example: 15000
 *
 *         isAvailable:
 *           type: boolean
 *           description: Indica se o campo está disponível para utilização/reserva.
 *           example: true
 *
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Data de criação do registo.
 *           example: 2026-09-29T10:00:00.000Z
 *
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Data da última atualização do registo.
 *           example: 2026-09-29T12:30:00.000Z
 *
 *     CreateFieldRequest:
 *       type: object
 *       required:
 *         - name
 *         - address
 *         - cityId
 *         - pricePerHour
 *       properties:
 *         name:
 *           type: string
 *           minLength: 3
 *           description: Nome do campo.
 *           example: Campo do Kilamba
 *
 *         address:
 *           type: string
 *           minLength: 5
 *           description: Endereço físico do campo.
 *           example: Avenida 21 de Janeiro, Kilamba, Luanda
 *
 *         cityId:
 *           type: integer
 *           minimum: 1
 *           description: ID da cidade onde o campo está localizado.
 *           example: 1
 *
 *         pricePerHour:
 *           type: number
 *           format: double
 *           exclusiveMinimum: 0
 *           description: Preço por hora.
 *           example: 15000
 *
 *     UpdateFieldRequest:
 *       type: object
 *       minProperties: 1
 *       properties:
 *         name:
 *           type: string
 *           minLength: 3
 *           description: Novo nome do campo.
 *           example: Campo do Kilamba Premium
 *
 *         address:
 *           type: string
 *           minLength: 5
 *           description: Novo endereço do campo.
 *           example: Avenida 21 de Janeiro, Kilamba, Luanda
 *
 *         pricePerHour:
 *           type: number
 *           format: double
 *           exclusiveMinimum: 0
 *           description: Novo preço por hora.
 *           example: 18000
 *
 *         isAvailable:
 *           type: boolean
 *           description: Define se o campo está disponível.
 *           example: true
 *
 *     FieldList:
 *       type: array
 *       description: Lista de campos de futebol.
 *       items:
 *         $ref: '#/components/schemas/Field'
 */