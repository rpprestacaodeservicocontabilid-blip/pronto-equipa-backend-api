/**
 * @swagger
 * components:
 *   schemas:
 *
 *     RegisterNotificationDeviceRequest:
 *       type: object
 *       required:
 *         - platform
 *         - token
 *       properties:
 *         platform:
 *           type: string
 *           description: Plataforma do dispositivo. Os valores válidos são definidos pelo enum DevicePlatform da aplicação.
 *           example: "ANDROID"
 *         token:
 *           type: string
 *           description: Token utilizado pelo serviço de notificações push.
 *           example: "fcm_device_token_example_123456"
 *         deviceId:
 *           type: string
 *           nullable: true
 *           description: Identificador único do dispositivo.
 *           example: "device-abc-123"
 *         deviceName:
 *           type: string
 *           nullable: true
 *           description: Nome ou identificação amigável do dispositivo.
 *           example: "Samsung Galaxy S24"
 *         appVersion:
 *           type: string
 *           nullable: true
 *           description: Versão da aplicação instalada no dispositivo.
 *           example: "1.0.0"
 *         osVersion:
 *           type: string
 *           nullable: true
 *           description: Versão do sistema operativo do dispositivo.
 *           example: "Android 15"
 *
 *     NotificationDevice:
 *       type: object
 *       required:
 *         - id
 *         - userId
 *         - platform
 *         - deviceToken
 *         - isActive
 *         - createdAt
 *         - updatedAt
 *       properties:
 *         id:
 *           type: integer
 *           description: ID do dispositivo registado.
 *           example: 25
 *         userId:
 *           type: integer
 *           description: ID do utilizador proprietário do dispositivo.
 *           example: 15
 *         platform:
 *           type: string
 *           description: Plataforma do dispositivo.
 *           example: "ANDROID"
 *         deviceToken:
 *           type: string
 *           description: Token do dispositivo utilizado para notificações push.
 *           example: "fcm_device_token_example_123456"
 *         deviceId:
 *           type: string
 *           nullable: true
 *           description: Identificador único do dispositivo.
 *           example: "device-abc-123"
 *         deviceName:
 *           type: string
 *           nullable: true
 *           description: Nome do dispositivo.
 *           example: "Samsung Galaxy S24"
 *         appVersion:
 *           type: string
 *           nullable: true
 *           description: Versão da aplicação.
 *           example: "1.0.0"
 *         isActive:
 *           type: boolean
 *           description: Indica se o dispositivo está ativo para receber notificações.
 *           example: true
 *         lastUsedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Data e hora da última utilização do dispositivo.
 *           example: "2026-09-30T14:30:00.000Z"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Data de criação do registo.
 *           example: "2026-09-30T10:00:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Data da última atualização do registo.
 *           example: "2026-09-30T14:30:00.000Z"
 *
 *     NotificationDeviceResponse:
 *       type: object
 *       required:
 *         - success
 *         - data
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           $ref: '#/components/schemas/NotificationDevice'
 *
 *     NotificationDeviceListResponse:
 *       type: object
 *       required:
 *         - success
 *         - data
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/NotificationDevice'
 *
 *     NotificationDeviceErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: "Notification device not found."
 */