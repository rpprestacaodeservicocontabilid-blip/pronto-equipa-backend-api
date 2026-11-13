import { Router } from "express";
import { z } from "zod";

import { RoleModel } from "../../persistence/models/role.model";
import { UserRoleModel } from "../../persistence/models/user-role.model";
import { UserModel } from "../../persistence/models/user.model";
import { UserType } from "../../../domain/enums/user-type.enum";

const userTypeSchema = z.nativeEnum(UserType);

/**
 * GET /users/recent?limit=20&type=ORGANIZER
 *
 * Lista os usuários mais recentes cadastrados na plataforma,
 * incluindo o papel (role) principal de cada um.
 *
 * Necessário para o dashboard: o endpoint GET /users exige
 * busca por e-mail e não suporta listagem geral.
 */
export function createUserRecentRoutes(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    try {
      const rawLimit = Number(req.query.limit);
      const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
      let type: UserType | undefined;
      if (req.query.type !== undefined) {
        const parsedType = userTypeSchema.safeParse(req.query.type);
        if (!parsedType.success) {
          return res.status(400).json({ message: "Invalid user type." });
        }
        type = parsedType.data;
      }

      const users = await UserModel.findAll({
        where: type ? { type } : undefined,
        order: [["createdAt", "DESC"]],
        limit,
      });

      const userIds = users.map((user) => user.id);

      const userRoles = userIds.length
        ? await UserRoleModel.findAll({ where: { userId: userIds } })
        : [];

      const roleIds = [...new Set(userRoles.map((userRole) => userRole.roleId))];

      const roles = roleIds.length ? await RoleModel.findAll({ where: { id: roleIds } }) : [];

      const roleNameById = new Map(roles.map((role) => [role.id, role.name]));

      const rolesByUser = new Map<number, string[]>();
      for (const userRole of userRoles) {
        const roleName = roleNameById.get(userRole.roleId);
        if (!roleName) continue;
        const list = rolesByUser.get(userRole.userId) ?? [];
        list.push(roleName);
        rolesByUser.set(userRole.userId, list);
      }

      return res.json(
        users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          type: user.type,
          status: user.status,
          primaryRole: rolesByUser.get(user.id)?.[0] ?? null,
          createdAt: user.createdAt,
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro interno ao listar usuários recentes";
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
