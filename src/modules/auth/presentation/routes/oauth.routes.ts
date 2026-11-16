import { SessionManagerPort } from '../../application/ports/session-manager.port';
import { Router } from 'express';

import { OAuthController } from '../controllers/oauth.controller';

import { authenticationMiddleware } from '../middlewares/authentication.middleware';

import { TokenServicePort } from '../../application/ports/token-service.port';

export const oauthRoutes = (
  controller: OAuthController,
  tokenService: TokenServicePort,
  sessionManager: SessionManagerPort,
): Router => {
  const router = Router();

  /**
   * @swagger
   * /oauth/google:
   *   post:
   *     summary: Autenticar com Google
   *     description: |
   *       Autentica um utilizador através do Google utilizando
   *       um código de autorização OAuth.
   *
   *       Caso a conta Google ainda não esteja associada a uma
   *       conta existente, um novo utilizador e uma conta OAuth
   *       serão criados.
   *
   *       Em caso de sucesso, é criada uma sessão e são
   *       devolvidos um access token e um refresh token.
   *
   *     tags:
   *       - OAuth
   *
   *     security: []
   *
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/GoogleLoginRequest'
   *
   *     responses:
   *       200:
   *         description: Autenticação com Google realizada com sucesso.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/GoogleLoginResponse'
   *
   *       400:
   *         description: Código de autorização Google não fornecido ou dados inválidos.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *
   *       401:
   *         description: Falha na autenticação através do Google.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post('/google', controller.loginWithGoogle);

  /**
   * @swagger
   * /oauth/google/link:
   *   post:
   *     summary: Associar conta Google
   *     description: |
   *       Associa uma conta Google ao utilizador autenticado.
   *
   *       O utilizador deve fornecer um código de autorização
   *       OAuth válido emitido pelo Google.
   *
   *       A conta Google não pode estar previamente associada
   *       a outra conta do Peladeiro.
   *
   *     tags:
   *       - OAuth
   *
   *     security:
   *       - bearerAuth: []
   *
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/LinkGoogleAccountRequest'
   *
   *     responses:
   *       200:
   *         description: Conta Google associada com sucesso.
   *
   *       400:
   *         description: Código de autorização Google não fornecido ou dados inválidos.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       409:
   *         description: A conta Google já está associada a uma conta.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post(
    '/google/link',
    authenticationMiddleware(tokenService, sessionManager),
    controller.linkGoogleAccount,
  );

  /**
   * @swagger
   * /oauth/google/unlink:
   *   delete:
   *     summary: Desassociar conta Google
   *     description: |
   *       Remove a associação entre a conta Google e o utilizador
   *       atualmente autenticado.
   *
   *       O utilizador deve possuir uma conta Google previamente
   *       associada.
   *
   *     tags:
   *       - OAuth
   *
   *     security:
   *       - bearerAuth: []
   *
   *     responses:
   *       200:
   *         description: Conta Google desassociada com sucesso.
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       404:
   *         description: Conta Google não está associada ao utilizador.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.delete(
    '/google/unlink',
    authenticationMiddleware(tokenService, sessionManager),
    controller.unlinkGoogleAccount,
  );

  return router;
};
