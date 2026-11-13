/**
 * @swagger
 * components:
 *   schemas:
 *
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - phone
 *         - password
 *         - confirmPassword
 *         - acceptTerms
 *         - accountType
 *       properties:
 *         name:
 *           type: string
 *           description: Nome completo do utilizador.
 *           minLength: 2
 *           example: João Jamba
 *
 *         email:
 *           type: string
 *           format: email
 *           description: Email do utilizador.
 *           example: joao@email.com
 *
 *         phone:
 *           type: string
 *           description: |
 *             Número de telefone do utilizador. Pode ser usado
 *             como identificador no login e receber o OTP por SMS.
 *           example: "+244923456789"
 *
 *         password:
 *           type: string
 *           format: password
 *           description: Password da conta.
 *           minLength: 8
 *           example: Password123!
 *
 *         confirmPassword:
 *           type: string
 *           format: password
 *           description: Confirmação da password. Deve ser igual a `password`.
 *           minLength: 8
 *           example: Password123!
 *
 *         acceptTerms:
 *           type: boolean
 *           description: |
 *             Indica que o utilizador aceitou os termos e condições.
 *             Deve ser `true` para concluir o registo.
 *           example: true
 *
 *         accountType:
 *           type: string
 *           enum: [TEAM_OWNER, FIELD_OWNER, ORGANIZER]
 *           description: Role de utilizador final. ADMIN e SUPER_ADMIN só podem ser atribuídas pela administração.
 *           example: TEAM_OWNER
 *
 *         avatarUrl:
 *           type: string
 *           format: uri
 *           description: URL HTTPS opcional da foto de perfil.
 *
 *
 *     RegisterResponse:
 *       type: object
 *       properties:
 *         accountId:
 *           type: integer
 *           description: ID da conta de autenticação.
 *           example: 1
 *
 *         userId:
 *           type: integer
 *           description: ID do utilizador criado.
 *           example: 1
 *
 *         email:
 *           type: string
 *           format: email
 *           example: joao@email.com
 *
 *         phone:
 *           type: string
 *           description: Telefone normalizado do utilizador.
 *           example: "+244923456789"
 *
 *         status:
 *           type: string
 *           description: Estado atual da conta.
 *           example: PENDING_VERIFICATION
 *
 *         role:
 *           type: string
 *           description: Role atribuída ao utilizador conforme o tipo de conta.
 *           example: TEAM_OWNER
 *
 *         verificationChallengeId:
 *           type: integer
 *           description: Identificador do desafio para confirmar o email com OTP.
 *
 *         developmentCode:
 *           type: string
 *           description: Código exibido somente fora de produção.
 *
 *
 *     LoginRequest:
 *       type: object
 *       required:
 *         - identifier
 *         - password
 *       properties:
 *         identifier:
 *           type: string
 *           description: |
 *             Email ou número de telefone do utilizador.
 *             O OTP é enviado para o canal correspondente.
 *           example: joao@email.com
 *
 *         password:
 *           type: string
 *           format: password
 *           example: Password123!
 *
 *
 *     LoginChallengeResponse:
 *       type: object
 *       properties:
 *         otpRequired:
 *           type: boolean
 *           example: true
 *
 *         challengeId:
 *           type: integer
 *           description: Identificador do desafio a usar na confirmação do OTP.
 *           example: 42
 *
 *         channel:
 *           type: string
 *           enum:
 *             - email
 *             - sms
 *           example: email
 *
 *         destination:
 *           type: string
 *           description: Destino mascarado onde o código foi enviado.
 *           example: j***@email.com
 *
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           example: "2026-10-20T12:10:00.000Z"
 *
 *         developmentCode:
 *           type: string
 *           description: |
 *             Código OTP em texto simples. Apenas devolvido
 *             em ambientes não-produção.
 *           example: "123456"
 *
 *
 *     VerifyLoginOtpRequest:
 *       type: object
 *       required:
 *         - challengeId
 *         - code
 *       properties:
 *         challengeId:
 *           type: integer
 *           description: Identificador devolvido por `POST /auth/login`.
 *           example: 42
 *
 *         code:
 *           type: string
 *           description: Código OTP de 6 dígitos.
 *           minLength: 6
 *           maxLength: 6
 *           example: "123456"
 *
 *         deviceId:
 *           type: string
 *           description: Identificador opcional do dispositivo.
 *           example: device-abc
 *
 *
 *     ResendLoginOtpRequest:
 *       type: object
 *       required:
 *         - challengeId
 *       properties:
 *         challengeId:
 *           type: integer
 *           description: Identificador devolvido por `POST /auth/login`.
 *           example: 42
 *
 *
 *     LoginResponse:
 *       type: object
 *       properties:
 *         userId:
 *           type: integer
 *           example: 1
 *
 *         sessionId:
 *           type: integer
 *           example: 7
 *
 *         accessToken:
 *           type: string
 *           description: JWT utilizado para acessar recursos protegidos.
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *
 *         refreshToken:
 *           type: string
 *           description: Token utilizado para renovar o access token.
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *
 *         accessTokenExpiresAt:
 *           type: string
 *           format: date-time
 *
 *         refreshTokenExpiresAt:
 *           type: string
 *           format: date-time
 *
 *
 *     RefreshTokenRequest:
 *       type: object
 *       required:
 *         - refreshToken
 *       properties:
 *         refreshToken:
 *           type: string
 *           description: Refresh token válido.
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *
 *
 *     VerifyEmailRequest:
 *       type: object
 *       required:
 *         - challengeId
 *         - code
 *       properties:
 *         challengeId:
 *           type: integer
 *           example: 12
 *         code:
 *           type: string
 *           pattern: '^\\d{6}$'
 *           example: '123456'
 *         token:
 *           type: string
 *           description: Token legado, aceite para compatibilidade.
 *           example: verification-token-example
 *
 *
 *     ResendVerificationResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *
 *         message:
 *           type: string
 *           example: Email de verificação reenviado com sucesso.
 *
 *
 *     ForgotPasswordRequest:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Email associado à conta.
 *           example: joao@email.com
 *
 *
 *     ResetPasswordRequest:
 *       type: object
 *       required:
 *         - token
 *         - newPassword
 *         - confirmPassword
 *       properties:
 *         token:
 *           type: string
 *           description: Token de recuperação de password.
 *           example: reset-password-token-example
 *
 *         newPassword:
 *           type: string
 *           format: password
 *           minLength: 8
 *           description: Nova password.
 *           example: NewPassword123!
 *
 *         confirmPassword:
 *           type: string
 *           format: password
 *           minLength: 8
 *           description: Deve coincidir com newPassword.
 *           example: NewPassword123!
 *
 *
 *     ChangePasswordRequest:
 *       type: object
 *       required:
 *         - currentPassword
 *         - newPassword
 *       properties:
 *         currentPassword:
 *           type: string
 *           format: password
 *           description: Password atual.
 *           example: Password123!
 *
 *         newPassword:
 *           type: string
 *           format: password
 *           minLength: 8
 *           description: Nova password.
 *           example: NewPassword123!
 */
