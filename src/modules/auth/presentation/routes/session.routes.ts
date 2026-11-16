import { SessionManagerPort } from '../../application/ports/session-manager.port';
import { Router } from 'express';

import { SessionController } from '../controllers/session.controller';

import { authenticationMiddleware } from '../middlewares/authentication.middleware';

import { TokenServicePort } from '../../application/ports/token-service.port';

export const sessionRoutes = (
  controller: SessionController,
  tokenService: TokenServicePort,
  sessionManager: SessionManagerPort,
): Router => {
  const router = Router();

  router.use(authenticationMiddleware(tokenService, sessionManager));

  /**
   * @swagger
   * /sessions/current:
   *   get:
   *     summary: Obter sessão atual
   *     description: |
   *       Retorna os dados da sessão atualmente autenticada
   *       do utilizador.
   *
   *       O utilizador deve possuir um JWT válido.
   *
   *     tags:
   *       - Sessions
   *
   *     security:
   *       - bearerAuth: []
   *
   *     responses:
   *       200:
   *         description: Sessão atual obtida com sucesso.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SessionResponse'
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       404:
   *         $ref: '#/components/responses/NotFoundError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.get('/current', controller.current);

  /**
   * @swagger
   * /sessions/{sessionId}:
   *   delete:
   *     summary: Revogar uma sessão
   *     description: |
   *       Revoga uma sessão específica pertencente ao
   *       utilizador autenticado.
   *
   *       A sessão é identificada pelo seu ID.
   *
   *       O utilizador deve possuir um JWT válido.
   *
   *     tags:
   *       - Sessions
   *
   *     security:
   *       - bearerAuth: []
   *
   *     parameters:
   *       - name: sessionId
   *         in: path
   *         required: true
   *         description: ID da sessão que será revogada.
   *         schema:
   *           type: integer
   *           minimum: 1
   *           example: 42
   *
   *     responses:
   *       200:
   *         description: Sessão revogada com sucesso.
   *
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       404:
   *         $ref: '#/components/responses/NotFoundError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.delete('/:sessionId', controller.revoke);

  /**
   * @swagger
   * /sessions:
   *   delete:
   *     summary: Revogar todas as sessões
   *     description: |
   *       Revoga todas as sessões associadas ao utilizador
   *       autenticado.
   *
   *       A sessão atualmente utilizada é passada ao Use Case
   *       como `currentSessionId`.
   *
   *       O utilizador deve possuir um JWT válido.
   *
   *     tags:
   *       - Sessions
   *
   *     security:
   *       - bearerAuth: []
   *
   *     responses:
   *       200:
   *         description: Todas as sessões foram revogadas com sucesso.
   *
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.delete('/', controller.revokeAll);

  return router;
};
