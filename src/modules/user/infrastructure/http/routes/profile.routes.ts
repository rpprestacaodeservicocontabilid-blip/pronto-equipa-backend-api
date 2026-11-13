import { Router } from "express";

import { ProfileController } from "../controllers/profile.controller";

import { authenticationMiddleware } from "../../../../auth/infrastructure/http/middleware/authentication.middleware";
import { TokenServicePort } from "../../../../auth/application/ports/token-service.port";

export const profileRoutes = (
    controller: ProfileController,
    tokenService?: TokenServicePort,
): Router => {
    const router = Router();

    const requireAuth = tokenService
        ? authenticationMiddleware(tokenService)
        : (_req: unknown, _res: unknown, next: () => void) => next();

    /**
     * @swagger
     * /users/profile:
     *   post:
     *     summary: Criar ou gerar perfil do usuário
     *     description: Cria o perfil caso não exista; devolve o existente caso contrário (idempotente).
     *     tags: [Users]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [userId]
     *             properties:
     *               userId:
     *                 type: integer
     *                 minimum: 1
     *     responses:
     *       201:
     *         description: Perfil do usuário
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UserProfile'
     *       400:
     *         $ref: '#/components/responses/ValidationError'
     *       404:
     *         $ref: '#/components/responses/NotFoundError'
     *       500:
     *         $ref: '#/components/responses/InternalServerError'
     */
    router.post(
        "/",
        controller.ensure.bind(controller),
    );

    /**
     * @swagger
     * /users/profile/me:
     *   get:
     *     summary: Obter o próprio perfil
     *     description: Devolve o perfil do utilizador autenticado (Bearer JWT).
     *     tags: [Users]
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Perfil do usuário
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UserProfile'
     *       401:
     *         $ref: '#/components/responses/UnauthorizedError'
     *       404:
     *         $ref: '#/components/responses/NotFoundError'
     *       500:
     *         $ref: '#/components/responses/InternalServerError'
     */
    router.get(
        "/me",
        requireAuth,
        controller.me.bind(controller),
    );

    /**
     * @swagger
     * /users/profile/{userId}:
     *   get:
     *     summary: Obter perfil do usuário
     *     tags: [Users]
     *     parameters:
     *       - in: path
     *         name: userId
     *         required: true
     *         schema:
     *           type: integer
     *         description: Identificador do usuário
     *     responses:
     *       200:
     *         description: Perfil do usuário
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UserProfile'
     *       401:
     *         $ref: '#/components/responses/UnauthorizedError'
     *       404:
     *         $ref: '#/components/responses/NotFoundError'
     *       500:
     *         $ref: '#/components/responses/InternalServerError'
     */
    router.get(
        "/:userId",
        controller.get.bind(controller),
    );

    /**
     * @swagger
     * /users/profile/{userId}:
     *   patch:
     *     summary: Atualizar perfil do usuário
     *     tags: [Users]
     *     parameters:
     *       - in: path
     *         name: userId
     *         required: true
     *         schema:
     *           type: integer
     *         description: Identificador do usuário
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/UpdateProfile'
     *     responses:
     *       200:
     *         description: Perfil atualizado com sucesso
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/UserProfile'
     *       400:
     *         $ref: '#/components/responses/ValidationError'
     *       401:
     *         $ref: '#/components/responses/UnauthorizedError'
     *       404:
     *         $ref: '#/components/responses/NotFoundError'
     *       500:
     *         $ref: '#/components/responses/InternalServerError'
     */
    router.patch(
        "/:userId",
        controller.update.bind(controller),
    );

    return router;
};
