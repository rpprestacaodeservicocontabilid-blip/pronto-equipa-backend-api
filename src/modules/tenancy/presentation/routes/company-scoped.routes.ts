import { Router, Request, Response, NextFunction } from "express";

import { CompanyController } from "../controllers/company.controller";
import { MemberController } from "../controllers/member.controller";
import { RoleController } from "../controllers/role.controller";
import { updateCompanySchema } from "../schemas/company.schema";
import {
    listMembersSchema,
    addMemberSchema,
    updateMemberSchema,
} from "../schemas/member.schema";
import {
    createRoleSchema,
    updateRoleSchema,
    setRolePermissionsSchema,
} from "../schemas/role.schema";

type Middleware = (
    req: Request,
    res: Response,
    next: NextFunction,
) => void;

const validateBody =
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
                req.query = schema.parse(
                    req.query,
                ) as unknown as Request["query"];
                next();
            } catch (error) {
                next(error);
            }
        };

export interface CompanyScopedRoutesOptions {
    companyController: CompanyController;
    memberController: MemberController;
    roleController: RoleController;
    /** `requireCompanyPermission(permission)` contextual ao tenant. */
    requirePermission: (permission: string) => Middleware;
}

/**
 * Rotas do cliente de empresa — TODAS exigem contexto de tenant
 * (`req.tenant`) resolvido pelo middleware `tenantContext`, aplicado
 * pelo composition root antes deste router.
 *
 *  - `/company/context`, `/company` (leitura/actualização)
 *  - `/company/membros`
 *  - `/company/roles`
 */
export const createCompanyScopedRoutes = (
    options: CompanyScopedRoutesOptions,
): Router => {
    const {
        companyController,
        memberController,
        roleController,
        requirePermission,
    } = options;

    const router = Router();

    /**
     * @swagger
     * /company/context:
     *   get:
     *     summary: Contexto da empresa activa
     *     description: Devolve a empresa, o papel do membro e as permissões efectivas.
     *     tags: [Company]
     *     responses:
     *       200: { description: Contexto da empresa }
     *       400: { description: Contexto de empresa em falta }
     */
    router.get(
        "/context",
        requirePermission("company.read"),
        (req, res) => companyController.context(req, res),
    );

    /**
     * @swagger
     * /company:
     *   patch:
     *     summary: Actualizar dados da empresa
     *     tags: [Company]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               name: { type: string }
     *               nif: { type: string }
     *               email: { type: string }
     *               phone: { type: string }
     *     responses:
     *       200: { description: Empresa actualizada }
     *       403: { description: Sem permissão company.update }
     */
    router.patch(
        "/",
        requirePermission("company.update"),
        validateBody(updateCompanySchema),
        (req, res) => companyController.update(req, res),
    );

    // ============================================================
    // MEMBROS
    // ============================================================

    /**
     * @swagger
     * /company/membros:
     *   get:
     *     summary: Listar membros da empresa
     *     tags: [Company Members]
     *     responses:
     *       200: { description: Lista de membros }
     *       403: { description: Sem permissão company.members.read }
     *   post:
     *     summary: Adicionar membro à empresa
     *     tags: [Company Members]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [userId, roleId]
     *             properties:
     *               userId: { type: integer }
     *               roleId: { type: integer }
     *     responses:
     *       201: { description: Membro adicionado }
     *       403: { description: Sem permissão company.members.manage }
     *       409: { description: Utilizador já é membro }
     */
    router.get(
        "/membros",
        requirePermission("company.members.read"),
        validateQuery(listMembersSchema),
        (req, res) => memberController.list(req, res),
    );

    router.post(
        "/membros",
        requirePermission("company.members.manage"),
        validateBody(addMemberSchema),
        (req, res) => memberController.add(req, res),
    );

    /**
     * @swagger
     * /company/membros/{id}:
     *   patch:
     *     summary: Alterar papel ou estado de um membro
     *     tags: [Company Members]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: integer }
     *     responses:
     *       200: { description: Membro actualizado }
     *       400: { description: Último admin não pode ser removido }
     *   delete:
     *     summary: Remover membro (remoção lógica)
     *     tags: [Company Members]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: integer }
     *     responses:
     *       200: { description: Membro removido }
     */
    router.patch(
        "/membros/:id",
        requirePermission("company.members.manage"),
        validateBody(updateMemberSchema),
        (req, res) => memberController.update(req, res),
    );

    router.delete(
        "/membros/:id",
        requirePermission("company.members.manage"),
        (req, res) => memberController.remove(req, res),
    );

    // ============================================================
    // PAPÉIS
    // ============================================================

    /**
     * @swagger
     * /company/roles:
     *   get:
     *     summary: Listar papéis da empresa
     *     description: Inclui os papéis próprios da empresa e as roles globais do sistema.
     *     tags: [Company Roles]
     *     responses:
     *       200: { description: Lista de papéis }
     *   post:
     *     summary: Criar papel da empresa
     *     tags: [Company Roles]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [name]
     *             properties:
     *               name: { type: string }
     *               description: { type: string }
     *               permissionNames:
     *                 type: array
     *                 items: { type: string }
     *     responses:
     *       201: { description: Papel criado }
     *       403: { description: Sem permissão company.roles.manage }
     *       409: { description: Nome já utilizado na empresa }
     */
    router.get(
        "/roles",
        requirePermission("company.members.read"),
        (req, res) => roleController.list(req, res),
    );

    router.post(
        "/roles",
        requirePermission("company.roles.manage"),
        validateBody(createRoleSchema),
        (req, res) => roleController.create(req, res),
    );

    /**
     * @swagger
     * /company/roles/{id}:
     *   patch:
     *     summary: Alterar papel da empresa
     *     tags: [Company Roles]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: integer }
     *     responses:
     *       200: { description: Papel actualizado }
     *   delete:
     *     summary: Apagar papel da empresa
     *     tags: [Company Roles]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: integer }
     *     responses:
     *       200: { description: Papel apagado }
     *       400: { description: Papel do sistema ou em uso }
     */
    router.patch(
        "/roles/:id",
        requirePermission("company.roles.manage"),
        validateBody(updateRoleSchema),
        (req, res) => roleController.update(req, res),
    );

    router.delete(
        "/roles/:id",
        requirePermission("company.roles.manage"),
        (req, res) => roleController.remove(req, res),
    );

    /**
     * @swagger
     * /company/roles/{id}/permissions:
     *   put:
     *     summary: Definir permissões do papel
     *     tags: [Company Roles]
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema: { type: integer }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [permissionNames]
     *             properties:
     *               permissionNames:
     *                 type: array
     *                 items: { type: string }
     *     responses:
     *       200: { description: Permissões actualizadas }
     *       404: { description: Permissão desconhecida }
     */
    router.put(
        "/roles/:id/permissions",
        requirePermission("company.roles.manage"),
        validateBody(setRolePermissionsSchema),
        (req, res) => roleController.setPermissions(req, res),
    );

    return router;
};
