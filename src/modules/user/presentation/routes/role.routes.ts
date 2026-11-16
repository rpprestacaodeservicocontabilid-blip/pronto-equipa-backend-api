import { Router } from 'express';

import { RoleController } from '../controllers/role.controller';

export const roleRoutes = (controller: RoleController): Router => {
  const router = Router();

  /**
   * @swagger
   * /users/roles/users/{userId}:
   *   get:
   *     summary: Listar roles de um usuário
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
   *         description: Lista de roles do usuário
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Role'
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *       404:
   *         $ref: '#/components/responses/NotFoundError'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.get('/users/:userId', controller.getUserRoles.bind(controller));

  /**
   * @swagger
   * /users/roles/users/{userId}:
   *   post:
   *     summary: Atribuir role a um usuário
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
   *             $ref: '#/components/schemas/AssignRole'
   *     responses:
   *       200:
   *         description: Role atribuída com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Role'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *       404:
   *         $ref: '#/components/responses/NotFoundError'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post('/users/:userId', controller.assign.bind(controller));

  /**
   * @swagger
   * /users/roles/users/{userId}:
   *   delete:
   *     summary: Remover role de um usuário
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
   *             $ref: '#/components/schemas/RemoveRole'
   *     responses:
   *       200:
   *         description: Role removida com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Role'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *       404:
   *         $ref: '#/components/responses/NotFoundError'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.delete('/users/:userId', controller.remove.bind(controller));

  return router;
};
