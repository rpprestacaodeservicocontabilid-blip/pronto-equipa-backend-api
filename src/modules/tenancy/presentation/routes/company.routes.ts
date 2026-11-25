import { Router, Request, Response, NextFunction } from 'express';

import { CompanyController } from '../controllers/company.controller';
import { listMembersSchema } from '../schemas/member.schema';
import { createCompanySchema, listCompaniesSchema, updateCompanySchema } from '../schemas/company.schema';

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

const validate =
  (schema: { parse: (value: unknown) => unknown }): Middleware =>
  (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };

const validateQuery =
  (schema: { parse: (value: unknown) => unknown }): Middleware =>
  (req, _res, next) => {
    try {
      req.query = schema.parse(req.query) as Request['query'];
      next();
    } catch (error) {
      next(error);
    }
  };

/**
 * Rotas de empresas SEM contexto de tenant:
 *
 *  - `POST /api/v1/companies` — criar empresa (qualquer autenticado
 *    torna-se o primeiro admin da nova empresa);
 *  - `GET  /api/v1/companies` — empresas onde o utilizador é membro.
 *
 * A autenticação é aplicada pelo composition root antes deste router.
 */
export const createCompanyRoutes = (controller: CompanyController): Router => {
  const router = Router();

  /**
   * @swagger
   * /companies:
   *   post:
   *     summary: Criar empresa
   *     description: Cria uma empresa e torna o utilizador autenticado no seu primeiro admin.
   *     tags: [Companies]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name]
   *             properties:
   *               name: { type: string, maxLength: 150 }
   *               slug: { type: string }
   *               nif: { type: string }
   *               email: { type: string, format: email }
   *               phone: { type: string }
   *     responses:
   *       201: { description: Empresa criada }
   *       401: { description: Não autenticado }
   *       409: { description: Slug já utilizado }
   *   get:
   *     summary: Empresas do utilizador
   *     description: Lista as empresas onde o utilizador é membro activo.
   *     tags: [Companies]
   *     responses:
   *       200: { description: Lista de empresas }
   *       401: { description: Não autenticado }
   */
  router.post('/', validate(createCompanySchema), (req, res) => controller.create(req, res));

  router.get('/', (req, res) => controller.listMy(req, res));

  return router;
};

/**
 * Rotas de administração de plataforma (sem tenant):
 *
 *  - `GET    /api/v1/platform/companies`
 *  - `PATCH  /api/v1/platform/companies/:id/suspend`
 *  - `PATCH  /api/v1/platform/companies/:id/activate`
 *
 * Exige role de plataforma — aplicada pelo composition root.
 */
export const createPlatformCompanyRoutes = (controller: CompanyController): Router => {
  const router = Router();

  /**
   * @swagger
   * /platform/companies:
   *   get:
   *     summary: Listar todas as empresas (plataforma)
   *     tags: [Platform]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 20 }
   *       - in: query
   *         name: search
   *         schema: { type: string }
   *     responses:
   *       200: { description: Lista paginada de empresas }
   *       403: { description: Sem permissão de plataforma }
   */
  router.get('/companies', validateQuery(listCompaniesSchema), (req, res) =>
    controller.listAll(req, res),
  );

  /**
   * @swagger
   * /platform/companies/{id}/suspend:
   *   patch:
   *     summary: Suspender empresa
   *     tags: [Platform]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Empresa suspensa }
   *       409: { description: Estado inválido }
   */
  router.get('/companies/summary', (req, res) => controller.platformSummary(req, res));
  router.get('/companies/:id', (req, res) => controller.platformDetails(req, res));
  router.get('/companies/:id/members', validateQuery(listMembersSchema), (req, res) =>
    controller.platformMembers(req, res),
  );
  router.patch('/companies/:id', validate(updateCompanySchema), (req, res) => controller.platformUpdate(req, res));

  router.patch('/companies/:id/suspend', (req, res) => controller.suspend(req, res));

  /**
   * @swagger
   * /platform/companies/{id}/activate:
   *   patch:
   *     summary: Reactivar empresa
   *     tags: [Platform]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200: { description: Empresa reactivada }
   */
  router.patch('/companies/:id/activate', (req, res) => controller.activate(req, res));

  return router;
};
