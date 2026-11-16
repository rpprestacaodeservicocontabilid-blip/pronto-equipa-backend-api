/**
 * @swagger
 * components:
 *   schemas:
 *
 *     CreatePlayerRequest:
 *       type: object
 *       required:
 *         - fullName
 *         - birthDate
 *         - position
 *         - jerseyNumber
 *         - teamId
 *         - cityId
 *       properties:
 *         fullName:
 *           type: string
 *           minLength: 3
 *           maxLength: 150
 *           description: Nome completo do jogador.
 *           example: "João Manuel"
 *         nickname:
 *           type: string
 *           nullable: true
 *           maxLength: 100
 *           description: Nome ou alcunha utilizada pelo jogador.
 *           example: "Jamba"
 *         birthDate:
 *           type: string
 *           format: date
 *           description: Data de nascimento do jogador.
 *           example: "1998-05-20"
 *         position:
 *           type: string
 *           description: Posição do jogador. Os valores válidos são definidos pelo enum PlayerPosition.
 *           example: "MIDFIELDER"
 *         jerseyNumber:
 *           type: integer
 *           minimum: 1
 *           maximum: 99
 *           description: Número da camisola.
 *           example: 10
 *         teamId:
 *           type: integer
 *           minimum: 1
 *           description: ID da equipa do jogador.
 *           example: 5
 *         cityId:
 *           type: integer
 *           minimum: 1
 *           description: ID da cidade do jogador.
 *           example: 1
 *
 *     UpdatePlayerRequest:
 *       type: object
 *       properties:
 *         fullName:
 *           type: string
 *           minLength: 3
 *           maxLength: 150
 *           example: "João Manuel"
 *         nickname:
 *           type: string
 *           nullable: true
 *           maxLength: 100
 *           example: "Jamba"
 *         avatar:
 *           type: string
 *           format: uri
 *           description: URL da imagem/avatar do jogador.
 *           example: "https://example.com/avatars/player.jpg"
 *         jerseyNumber:
 *           type: integer
 *           minimum: 1
 *           maximum: 99
 *           example: 10
 *
 *     Player:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Identificador único do jogador.
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         fullName:
 *           type: string
 *           example: "João Manuel"
 *         nickname:
 *           type: string
 *           nullable: true
 *           example: "Jamba"
 *         birthDate:
 *           type: string
 *           format: date-time
 *           example: "1998-05-20T00:00:00.000Z"
 *         position:
 *           type: string
 *           example: "MIDFIELDER"
 *         jerseyNumber:
 *           type: integer
 *           example: 10
 *         teamId:
 *           type: integer
 *           example: 5
 *         cityId:
 *           type: integer
 *           example: 1
 *         avatar:
 *           type: string
 *           nullable: true
 *           example: "https://example.com/avatars/player.jpg"
 *         attack:
 *           type: integer
 *           description: Avaliação das capacidades ofensivas.
 *           example: 75
 *         defense:
 *           type: integer
 *           description: Avaliação das capacidades defensivas.
 *           example: 65
 *         passing:
 *           type: integer
 *           description: Avaliação da capacidade de passe.
 *           example: 82
 *         speed:
 *           type: integer
 *           description: Avaliação da velocidade.
 *           example: 78
 *         stamina:
 *           type: integer
 *           description: Avaliação da resistência física.
 *           example: 80
 *         matchesPlayed:
 *           type: integer
 *           example: 32
 *         goals:
 *           type: integer
 *           example: 12
 *         assists:
 *           type: integer
 *           example: 15
 *         yellowCards:
 *           type: integer
 *           example: 3
 *         redCards:
 *           type: integer
 *           example: 0
 *         cleanSheets:
 *           type: integer
 *           example: 8
 *         mvpAwards:
 *           type: integer
 *           example: 4
 *         minutesPlayed:
 *           type: integer
 *           example: 2450
 *         isCaptain:
 *           type: boolean
 *           example: false
 *         isActive:
 *           type: boolean
 *           example: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-01T10:00:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: "2026-09-20T15:30:00.000Z"
 *
 *     PlayerResponse:
 *       type: object
 *       properties:
 *         data:
 *           $ref: '#/components/schemas/Player'
 *
 *     PlayerListResponse:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Player'
 *         total:
 *           type: integer
 *           example: 25
 *
 *     PlayerCreatedResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Player created successfully"
 *         data:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *               example: "550e8400-e29b-41d4-a716-446655440000"
 *
 *     PlayerMessageResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Player updated successfully"
 *
 *     PlayerErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: "PLAYER_NOT_FOUND"
 *         message:
 *           type: string
 *           example: "Player not found."
 *
 *     PlayerSearchResponse:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Player'
 *         total:
 *           type: integer
 *           example: 3
 */
