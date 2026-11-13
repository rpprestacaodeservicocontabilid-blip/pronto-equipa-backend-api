import { Router } from "express";

import { PermissionController } from "../controllers/permission.controller";

export const permissionRoutes = (
    controller: PermissionController,
): Router => {
    const router = Router();

    /**
     * @swagger
     * /users/permissions/users/{userId}:
     *   post:
     *     summary: Atribuir permissão a um usuário
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
     *             $ref: '#/components/schemas/AssignPermission'
     *     responses:
     *       200:
     *         description: Permissão atribuída com sucesso
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Permission'
     *       400:
     *         $ref: '#/components/responses/ValidationError'
     *       401:
     *         $ref: '#/components/responses/UnauthorizedError'
     *       404:
     *         $ref: '#/components/responses/NotFoundError'
     *       500:
     *         $ref: '#/components/responses/InternalServerError'
     */
    router.post(
        "/users/:userId",
        controller.assign.bind(controller),
    );

    /**
     * @swagger
     * /users/permissions/users/{userId}:
     *   delete:
     *     summary: Remover permissão de um usuário
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
     *             $ref: '#/components/schemas/RemovePermission'
     *     responses:
     *       200:
     *         description: Permissão removida com sucesso
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Permission'
     *       400:
     *         $ref: '#/components/responses/ValidationError'
     *       401:
     *         $ref: '#/components/responses/UnauthorizedError'
     *       404:
     *         $ref: '#/components/responses/NotFoundError'
     *       500:
     *         $ref: '#/components/responses/InternalServerError'
     */
    router.delete(
        "/users/:userId",
        controller.remove.bind(controller),
    );

    /**
     * @swagger
     * /users/permissions/users/{userId}/{permissionId}/check:
     *   get:
     *     summary: Verificar permissão do usuário
     *     tags: [Users]
     *     parameters:
     *       - in: path
     *         name: userId
     *         required: true
     *         schema:
     *           type: integer
     *         description: Identificador do usuário
     *       - in: path
     *         name: permissionId
     *         required: true
     *         schema:
     *           type: integer
     *         description: Identificador da permissão
     *     responses:
     *       200:
     *         description: Resultado da verificação
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 hasPermission:
     *                   type: boolean
     *                   example: true
     *       401:
     *         $ref: '#/components/responses/UnauthorizedError'
     *       404:
     *         $ref: '#/components/responses/NotFoundError'
     *       500:
     *         $ref: '#/components/responses/InternalServerError'
     */
    router.get(
        "/users/:userId/:permissionId/check",
        controller.check.bind(controller),
    );

    return router;
};
