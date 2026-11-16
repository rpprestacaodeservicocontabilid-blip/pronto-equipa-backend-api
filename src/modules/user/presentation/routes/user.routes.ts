import { Router } from 'express';

import { UserController } from '../controllers/user.controller';

export const userRoutes = (controller: UserController): Router => {
  const router = Router();

  /**
   * @swagger
   * /users:
   *   post:
   *     summary: Criar usuário
   *     description: Cria um novo usuário na plataforma.
   *     tags: [Users]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateUser'
   *     responses:
   *       201:
   *         description: Usuário criado com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *       409:
   *         $ref: '#/components/responses/ConflictError'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.post('/', controller.create.bind(controller));

  /**
   * @swagger
   * /users:
   *   get:
   *     summary: Buscar usuário por email
   *     description: Retorna um usuário com base no email fornecido.
   *     tags: [Users]
   *     parameters:
   *       - in: query
   *         name: email
   *         required: true
   *         schema:
   *           type: string
   *           format: email
   *         description: Email do usuário
   *     responses:
   *       200:
   *         description: Usuário encontrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *       404:
   *         $ref: '#/components/responses/NotFoundError'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.get('/', controller.getByEmail.bind(controller));

  /**
   * @swagger
   * /users/{id}:
   *   get:
   *     summary: Obter usuário pelo ID
   *     tags: [Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Identificador do usuário
   *     responses:
   *       200:
   *         description: Usuário encontrado
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *       404:
   *         $ref: '#/components/responses/NotFoundError'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.get('/:id', controller.getById.bind(controller));

  /**
   * @swagger
   * /users/{id}:
   *   patch:
   *     summary: Atualizar usuário
   *     tags: [Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Identificador do usuário
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpdateUser'
   *     responses:
   *       200:
   *         description: Usuário atualizado com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *       404:
   *         $ref: '#/components/responses/NotFoundError'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.patch('/:id', controller.update.bind(controller));

  /**
   * @swagger
   * /users/{id}:
   *   delete:
   *     summary: Remover usuário
   *     tags: [Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Identificador do usuário
   *     responses:
   *       204:
   *         description: Usuário removido com sucesso
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *       404:
   *         $ref: '#/components/responses/NotFoundError'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.delete('/:id', controller.delete.bind(controller));

  /**
   * @swagger
   * /users/{id}/activate:
   *   patch:
   *     summary: Ativar usuário
   *     tags: [Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Identificador do usuário
   *     responses:
   *       200:
   *         description: Usuário ativado com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *       404:
   *         $ref: '#/components/responses/NotFoundError'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.patch('/:id/activate', controller.activate.bind(controller));

  /**
   * @swagger
   * /users/{id}/deactivate:
   *   patch:
   *     summary: Desativar usuário
   *     tags: [Users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Identificador do usuário
   *     responses:
   *       200:
   *         description: Usuário desativado com sucesso
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/User'
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *       404:
   *         $ref: '#/components/responses/NotFoundError'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.patch('/:id/deactivate', controller.deactivate.bind(controller));

  return router;
};
