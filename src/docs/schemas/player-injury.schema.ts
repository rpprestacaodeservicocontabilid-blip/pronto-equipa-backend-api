/**
 * @swagger
 * components:
 *   schemas:
 *
 *     PlayerInjuryType:
 *       type: string
 *       description: Tipo de lesão sofrida pelo jogador.
 *       example: MUSCULAR
 *
 *     CreatePlayerInjuryRequest:
 *       type: object
 *       required:
 *         - playerId
 *         - type
 *         - description
 *         - severity
 *       properties:
 *         playerId:
 *           oneOf:
 *             - type: string
 *             - type: integer
 *               format: int64
 *           description: Identificador do jogador.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *         type:
 *           $ref: '#/components/schemas/PlayerInjuryType'
 *
 *         description:
 *           type: string
 *           minLength: 3
 *           maxLength: 500
 *           description: Descrição da lesão.
 *           example: "Lesão muscular na coxa direita."
 *
 *         severity:
 *           type: integer
 *           minimum: 1
 *           maximum: 10
 *           description: Gravidade da lesão numa escala de 1 a 10.
 *           example: 7
 *
 *         injuryDate:
 *           type: string
 *           format: date-time
 *           description: Data e hora em que a lesão ocorreu. Não pode ser futura.
 *           example: "2026-09-15T18:30:00.000Z"
 *
 *         estimatedRecoveryDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Data estimada para recuperação.
 *           example: "2026-10-15T18:30:00.000Z"
 *
 *         treatmentNotes:
 *           type: string
 *           maxLength: 1000
 *           description: Observações relacionadas ao tratamento.
 *           example: "Repouso e fisioterapia durante quatro semanas."
 *
 *     RecoverPlayerInjuryRequest:
 *       type: object
 *       properties:
 *         treatmentNotes:
 *           type: string
 *           maxLength: 1000
 *           description: Observações finais relacionadas à recuperação.
 *           example: "Jogador recuperado após completar o tratamento."
 *
 *     PlayerInjury:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *         playerId:
 *           oneOf:
 *             - type: string
 *             - type: integer
 *           description: Identificador do jogador.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *         type:
 *           $ref: '#/components/schemas/PlayerInjuryType'
 *
 *         description:
 *           type: string
 *           example: "Lesão muscular na coxa direita."
 *
 *         severity:
 *           type: integer
 *           minimum: 1
 *           maximum: 10
 *           example: 7
 *
 *         injuryDate:
 *           type: string
 *           format: date-time
 *           example: "2026-09-15T18:30:00.000Z"
 *
 *         estimatedRecoveryDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: "2026-10-15T18:30:00.000Z"
 *
 *         isRecovered:
 *           type: boolean
 *           example: false
 *
 *         recoveredAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: null
 *
 *         treatmentNotes:
 *           type: string
 *           example: "Repouso e fisioterapia durante quatro semanas."
 *
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-15T18:35:00.000Z"
 *
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-15T18:35:00.000Z"
 *
 *     PlayerInjuryCreatedResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: ID da lesão criada.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *     PlayerInjuryMessageResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Injury recovered"
 *
 *     PlayerInjuryValidationError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: VALIDATION_ERROR
 *         message:
 *           type: string
 *           example: Invalid injury data
 *
 *     PlayerInjuryError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: INTERNAL_SERVER_ERROR
 *         message:
 *           type: string
 *           example: An unexpected error occurred
 */
