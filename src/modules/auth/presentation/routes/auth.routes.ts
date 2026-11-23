import { SessionManagerPort } from '../../application/ports/session-manager.port';
import { Router } from 'express';

import { AuthController } from '../controllers/auth.controller';

import { authenticationMiddleware } from '../middlewares/authentication.middleware';

import { rateLimitMiddleware } from '../middlewares/rate-limit.middleware';

import { securityMiddleware } from '../middlewares/security.middleware';

import { RateLimiter } from '../middlewares/rate-limiter';

import { TokenServicePort } from '../../application/ports/token-service.port';

export const authRoutes = (
  controller: AuthController,
  tokenService: TokenServicePort,
  authRateLimiter: RateLimiter,
  sessionManager: SessionManagerPort,
): Router => {
  const router = Router();

  router.use(securityMiddleware);
  router.post('/browser/refresh', controller.refreshBrowser);
  router.post('/browser/logout', controller.logoutBrowser);

  /**
   * @swagger
   * /auth/register:
   *   post:
   *     summary: Registar novo utilizador
   *     description: |
   *       Cria um novo utilizador e a respetiva conta de autenticação.
   *
   *       O número de telefone é obrigatório e pode ser usado
   *       como identificador no login.
   *
   *       A password deve ser confirmada e os termos e condições
   *       têm de ser aceites.
   *
   *       Após o registo, um email de verificação é enviado
   *       para o endereço fornecido.
   *
   *     tags:
   *       - Auth
   *
   *     security: []
   *
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RegisterRequest'
   *
   *     responses:
   *       201:
   *         description: Utilizador registado com sucesso.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/RegisterResponse'
   *
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *
   *       409:
   *         $ref: '#/components/responses/ConflictError'
   *
   *       429:
   *         $ref: '#/components/responses/TooManyRequestsError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post(
    '/register',

    rateLimitMiddleware(authRateLimiter),

    controller.register,
  );

  /**
   * @swagger
   * /auth/login:
   *   post:
   *     summary: Iniciar autenticação
   *     description: |
   *       Valida o email (ou telefone) e a password.
   *
   *       Em caso de sucesso, é enviado um código OTP de 6 dígitos
   *       para o email ou para o telefone indicado. O código deve
   *       ser confirmado em `POST /auth/login/verify-otp`.
   *
   *     tags:
   *       - Auth
   *
   *     security: []
   *
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/LoginRequest'
   *
   *     responses:
   *       200:
   *         description: Credenciais válidas; OTP enviado.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/LoginChallengeResponse'
   *
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       429:
   *         $ref: '#/components/responses/TooManyRequestsError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post(
    '/login',

    rateLimitMiddleware(authRateLimiter),

    controller.login,
  );

  /**
   * @swagger
   * /auth/login/verify-otp:
   *   post:
   *     summary: Confirmar OTP de login
   *     description: |
   *       Confirma o código OTP enviado após a validação
   *       das credenciais.
   *
   *       Em caso de sucesso, a API devolve os tokens
   *       necessários para autenticação.
   *
   *     tags:
   *       - Auth
   *
   *     security: []
   *
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/VerifyLoginOtpRequest'
   *
   *     responses:
   *       200:
   *         description: Login efetuado com sucesso.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/LoginResponse'
   *
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       429:
   *         $ref: '#/components/responses/TooManyRequestsError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post(
    '/login/verify-otp',

    rateLimitMiddleware(authRateLimiter),

    controller.verifyLoginOtp,
  );

  /**
   * @swagger
   * /auth/login/resend-otp:
   *   post:
   *     summary: Reenviar OTP de login
   *     description: |
   *       Reenvia o código OTP do desafio de login indicado.
   *
   *       Existe um período de espera de 60 segundos entre reenvios.
   *
   *     tags:
   *       - Auth
   *
   *     security: []
   *
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ResendLoginOtpRequest'
   *
   *     responses:
   *       200:
   *         description: Novo código OTP enviado.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/LoginChallengeResponse'
   *
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       429:
   *         $ref: '#/components/responses/TooManyRequestsError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post(
    '/login/resend-otp',

    rateLimitMiddleware(authRateLimiter),

    controller.resendLoginOtp,
  );

  /**
   * @swagger
   * /auth/refresh:
   *   post:
   *     summary: Renovar access token
   *     description: |
   *       Gera um novo access token utilizando um refresh token válido.
   *
   *     tags:
   *       - Auth
   *
   *     security: []
   *
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/RefreshTokenRequest'
   *
   *     responses:
   *       200:
   *         description: Token renovado com sucesso.
   *
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post(
    '/refresh',

    controller.refreshToken,
  );

  /**
   * @swagger
   * /auth/logout:
   *   post:
   *     summary: Encerrar sessão
   *     description: |
   *       Encerra a sessão atual do utilizador autenticado.
   *
   *     tags:
   *       - Auth
   *
   *     security:
   *       - bearerAuth: []
   *
   *     responses:
   *       200:
   *         description: Logout efetuado com sucesso.
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post(
    '/logout',

    authenticationMiddleware(tokenService, sessionManager),

    controller.logout,
  );

  /**
   * @swagger
   * /auth/verify-email:
   *   post:
   *     summary: Verificar endereço de email
   *     description: |
   *       Confirma o endereço de email do utilizador utilizando
   *       o token enviado por email.
   *
   *     tags:
   *       - Auth
   *
   *     security: []
   *
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/VerifyEmailRequest'
   *
   *     responses:
   *       200:
   *         description: Email verificado com sucesso.
   *
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post(
    '/verify-email',

    controller.verifyEmail,
  );

  /**
   * @swagger
   * /auth/resend-verification:
   *   post:
   *     summary: Reenviar email de verificação
   *     description: |
   *       Reenvia o email de verificação para o utilizador autenticado.
   *
   *     tags:
   *       - Auth
   *
   *     security: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email]
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *
   *     responses:
   *       200:
   *         description: Email de verificação reenviado com sucesso.
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       429:
   *         $ref: '#/components/responses/TooManyRequestsError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post(
    '/resend-verification',

    rateLimitMiddleware(authRateLimiter),

    controller.resendEmailVerification,
  );

  /**
   * @swagger
   * /auth/forgot-password:
   *   post:
   *     summary: Solicitar recuperação de password
   *     description: |
   *       Inicia o processo de recuperação de password.
   *
   *       Um email com as instruções de recuperação será enviado
   *       para o endereço associado à conta.
   *
   *     tags:
   *       - Auth
   *
   *     security: []
   *
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ForgotPasswordRequest'
   *
   *     responses:
   *       200:
   *         description: Processo de recuperação iniciado.
   *
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *
   *       429:
   *         $ref: '#/components/responses/TooManyRequestsError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post(
    '/forgot-password',

    rateLimitMiddleware(authRateLimiter),

    controller.forgotPassword,
  );

  /**
   * @swagger
   * /auth/reset-password:
   *   post:
   *     summary: Redefinir password
   *     description: |
   *       Redefine a password do utilizador utilizando um token
   *       válido de recuperação.
   *
   *     tags:
   *       - Auth
   *
   *     security: []
   *
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ResetPasswordRequest'
   *
   *     responses:
   *       200:
   *         description: Password redefinida com sucesso.
   *
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post(
    '/reset-password',

    controller.resetPassword,
  );

  /**
   * @swagger
   * /auth/change-password:
   *   post:
   *     summary: Alterar password
   *     description: |
   *       Permite ao utilizador autenticado alterar a sua password.
   *
   *     tags:
   *       - Auth
   *
   *     security:
   *       - bearerAuth: []
   *
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/ChangePasswordRequest'
   *
   *     responses:
   *       200:
   *         description: Password alterada com sucesso.
   *
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post(
    '/change-password',

    authenticationMiddleware(tokenService, sessionManager),

    controller.changePassword,
  );

  return router;
};
