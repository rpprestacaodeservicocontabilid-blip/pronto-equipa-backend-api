import { Router } from "express";
import { Op } from "sequelize";

import { ENV } from "../../../../config/env";
import { RolePermissionModel } from "../persistence/model/role-permission.model";
import { UserRoleModel } from "../persistence/model/user-role.model";
import { PermissionModel } from "../persistence/model/permission.model";
import { JwtTokenService } from "../service/jwt-token.service";
import { authenticationMiddleware } from "../http/middleware/authentication.middleware";
import { roleMiddleware } from "../http/middleware/role.middleware";

export function createAuthorizationCheckRoutes(): Router {
  const router = Router();
  const tokenService = new JwtTokenService(
    ENV.JWT.SECRET,
    ENV.JWT.EXPIRES_IN || "15m",
  );

  router.use(authenticationMiddleware(tokenService));
  router.use(roleMiddleware("ADMIN"));

  /**
   * @swagger
   * /authorization/users/{userId}/permissions/{permission}:
   *   get:
   *     summary: Verificar permissão atribuída a um utilizador
   *     tags: [Authorization]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *       - in: path
   *         name: permission
   *         required: true
   *         schema:
   *           type: string
   *           example: MATCH_CREATE
   *     responses:
   *       200:
   *         description: Indica se a permissão está atribuída ao utilizador.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/PermissionCheckResponse'
   *       400:
   *         $ref: '#/components/responses/ValidationError'
   *       401:
   *         $ref: '#/components/responses/UnauthorizedError'
   *       403:
   *         $ref: '#/components/responses/ForbiddenError'
   *       500:
   *         $ref: '#/components/responses/InternalServerError'
   */
  router.get("/users/:userId/permissions/:permission", async (req, res, next) => {
    const userId = Number(req.params.userId);
    const permissionName = req.params.permission;

    if (!Number.isInteger(userId) || userId <= 0 || !permissionName) {
      res.status(400).json({
        success: false,
        error: "Invalid user ID or permission.",
      });
      return;
    }

    try {
      const assignments = await UserRoleModel.findAll({
        attributes: ["roleId"],
        where: { userId },
      });
      const roleIds = [...new Set(assignments.map(({ roleId }) => roleId))];

      if (roleIds.length === 0) {
        res.status(200).json({ allowed: false });
        return;
      }

      const rolePermissions = await RolePermissionModel.findAll({
        attributes: ["permissionId"],
        where: { roleId: { [Op.in]: roleIds } },
      });
      const permissionIds = [
        ...new Set(rolePermissions.map(({ permissionId }) => permissionId)),
      ];

      const permission = permissionIds.length
        ? await PermissionModel.findOne({
            attributes: ["id"],
            where: {
              id: { [Op.in]: permissionIds },
              name: permissionName,
            },
          })
        : null;

      res.status(200).json({ allowed: permission !== null });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
