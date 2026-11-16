/**
 * @swagger
 * components:
 *   schemas:
 *
 *     PlayerRatingAttribute:
 *       type: string
 *       description: Atributo do jogador que está a ser avaliado.
 *       example: SPEED
 *
 *     CreatePlayerRatingRequest:
 *       type: object
 *       required:
 *         - playerId
 *         - attribute
 *         - value
 *         - ratedBy
 *         - comment
 *       properties:
 *         playerId:
 *           oneOf:
 *             - type: string
 *             - type: integer
 *               format: int64
 *           description: Identificador do jogador avaliado.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *         attribute:
 *           $ref: '#/components/schemas/PlayerRatingAttribute'
 *
 *         value:
 *           type: integer
 *           minimum: 0
 *           maximum: 99
 *           description: Valor da avaliação numa escala de 0 a 99.
 *           example: 85
 *
 *         ratedBy:
 *           oneOf:
 *             - type: string
 *             - type: integer
 *               format: int64
 *           description: Identificador do utilizador que realizou a avaliação.
 *           example: 25
 *
 *         comment:
 *           type: string
 *           minLength: 3
 *           maxLength: 500
 *           description: Comentário associado à avaliação.
 *           example: "Excelente velocidade e capacidade de aceleração."
 *
 *     VerifyPlayerRatingRequest:
 *       type: object
 *       required:
 *         - verifiedBy
 *       properties:
 *         verifiedBy:
 *           oneOf:
 *             - type: string
 *             - type: integer
 *               format: int64
 *           description: Identificador do utilizador que verifica a avaliação.
 *           example: 10
 *
 *     PlayerRating:
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
 *         attribute:
 *           $ref: '#/components/schemas/PlayerRatingAttribute'
 *
 *         value:
 *           type: integer
 *           minimum: 0
 *           maximum: 99
 *           example: 85
 *
 *         ratedBy:
 *           oneOf:
 *             - type: string
 *             - type: integer
 *           example: 25
 *
 *         comment:
 *           type: string
 *           example: "Excelente velocidade e capacidade de aceleração."
 *
 *         isVerified:
 *           type: boolean
 *           example: true
 *
 *         verifiedBy:
 *           oneOf:
 *             - type: string
 *             - type: integer
 *             - type: "null"
 *           example: 10
 *
 *         verifiedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: "2026-09-15T19:00:00.000Z"
 *
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-15T18:30:00.000Z"
 *
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-15T19:00:00.000Z"
 *
 *     PlayerRatingCreatedResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: ID da avaliação criada.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *     PlayerRatingAverageResponse:
 *       type: object
 *       properties:
 *         average:
 *           type: number
 *           format: float
 *           description: Média das avaliações.
 *           example: 84.5
 *
 *     PlayerRatingMessageResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Rating verified"
 *
 *     PlayerRatingValidationError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: VALIDATION_ERROR
 *         message:
 *           type: string
 *           example: Invalid rating data
 *
 *     PlayerRatingError:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: INTERNAL_SERVER_ERROR
 *         message:
 *           type: string
 *           example: An unexpected error occurred
 */
