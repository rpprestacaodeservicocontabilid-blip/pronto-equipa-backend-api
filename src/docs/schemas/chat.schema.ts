/**
 * @swagger
 * components:
 *   schemas:
 *     ChatConversationStatus:
 *       type: string
 *       description: Estado da conversa.
 *       enum:
 *         - OPEN
 *         - CLOSED
 *       example: OPEN
 *
 *     ChatCloseReason:
 *       type: string
 *       nullable: true
 *       description: >
 *         Motivo do fecho: MATCH_FINISHED (6h após o fim do jogo),
 *         MATCH_NEVER_FINISHED (cap de 24h), MATCH_CANCELLED ou MANUAL.
 *       enum:
 *         - MATCH_FINISHED
 *         - MATCH_NEVER_FINISHED
 *         - MATCH_CANCELLED
 *         - MANUAL
 *
 *     ChatParticipant:
 *       type: object
 *       description: Participante da conversa (dono de uma das equipas).
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         conversationId:
 *           type: integer
 *           example: 10
 *         userId:
 *           type: integer
 *           example: 4
 *         teamId:
 *           type: integer
 *           example: 7
 *         role:
 *           type: string
 *           example: OWNER
 *         lastReadAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: "2026-10-16T12:00:00.000Z"
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     ChatConversation:
 *       type: object
 *       description: Conversa de uma partida entre os donos das duas equipas.
 *       properties:
 *         id:
 *           type: integer
 *           example: 10
 *         matchId:
 *           type: integer
 *           example: 15
 *         homeTeamId:
 *           type: integer
 *           example: 7
 *         awayTeamId:
 *           type: integer
 *           example: 9
 *         cityId:
 *           type: integer
 *           nullable: true
 *           example: 5
 *         status:
 *           $ref: '#/components/schemas/ChatConversationStatus'
 *         openedAt:
 *           type: string
 *           format: date-time
 *         closesAt:
 *           type: string
 *           format: date-time
 *           description: Prazo máximo da conversa (hora marcada + 24h, ou fim do jogo + 6h).
 *         matchFinishedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         closedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         closeReason:
 *           $ref: '#/components/schemas/ChatCloseReason'
 *         lastMessageAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         unreadCount:
 *           type: integer
 *           description: Mensagens não lidas (apenas na listagem do próprio utilizador).
 *           example: 3
 *         participants:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ChatParticipant'
 *
 *     ChatMessageType:
 *       type: string
 *       description: Tipo da mensagem.
 *       enum:
 *         - TEXT
 *         - VOICE
 *         - SYSTEM
 *       example: TEXT
 *
 *     ChatMessage:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 100
 *         conversationId:
 *           type: integer
 *           example: 10
 *         senderId:
 *           type: integer
 *           nullable: true
 *           description: null em mensagens de sistema.
 *           example: 4
 *         senderTeamId:
 *           type: integer
 *           nullable: true
 *           example: 7
 *         type:
 *           $ref: '#/components/schemas/ChatMessageType'
 *         content:
 *           type: string
 *           nullable: true
 *           description: Conteúdo textual (TEXT/SYSTEM).
 *         mediaUrl:
 *           type: string
 *           nullable: true
 *           description: URL do áudio (VOICE); em dev servido em /uploads/voice/...
 *           example: /uploads/voice/3f0f0e5a-....webm
 *         mediaDurationSec:
 *           type: integer
 *           nullable: true
 *           example: 12
 *         mediaMimeType:
 *           type: string
 *           nullable: true
 *           example: audio/webm
 *         mediaSizeBytes:
 *           type: integer
 *           nullable: true
 *           example: 48213
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     ChatMessagePage:
 *       type: object
 *       properties:
 *         conversationId:
 *           type: integer
 *           example: 10
 *         messages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ChatMessage'
 *         hasMore:
 *           type: boolean
 *           description: Existem mensagens mais antigas (usar beforeId para paginar).
 *           example: false
 */
export { };
