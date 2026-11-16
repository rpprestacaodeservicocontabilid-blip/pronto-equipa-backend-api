/**
 * @swagger
 * components:
 *   schemas:
 *
 *     GoogleLoginRequest:
 *       type: object
 *       required:
 *         - code
 *       properties:
 *         code:
 *           type: string
 *           description: Código de autorização OAuth fornecido pelo Google.
 *           minLength: 1
 *           example: 4/0AX4XfWhExampleAuthorizationCode
 *
 *         deviceId:
 *           type: string
 *           nullable: true
 *           description: Identificador opcional do dispositivo utilizado para iniciar a sessão.
 *           example: device-android-001
 *
 *
 *     GoogleLoginResponse:
 *       type: object
 *       required:
 *         - userId
 *         - sessionId
 *         - accessToken
 *         - refreshToken
 *       properties:
 *         userId:
 *           type: integer
 *           minimum: 1
 *           description: ID do utilizador autenticado.
 *           example: 15
 *
 *         sessionId:
 *           type: integer
 *           minimum: 1
 *           description: ID da sessão criada para o utilizador.
 *           example: 42
 *
 *         accessToken:
 *           type: string
 *           description: JWT utilizado para autenticar pedidos protegidos.
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *
 *         refreshToken:
 *           type: string
 *           description: Token utilizado para renovar a sessão.
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *
 *
 *     LinkGoogleAccountRequest:
 *       type: object
 *       required:
 *         - code
 *       properties:
 *         code:
 *           type: string
 *           description: Código de autorização OAuth fornecido pelo Google.
 *           minLength: 1
 *           example: 4/0AX4XfWhExampleAuthorizationCode
 *
 *
 *     OAuthSuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *
 *         message:
 *           type: string
 *           example: Operation completed successfully.
 */
