import { Op } from "sequelize";

import { PermissionModel } from "../persistence/models/permission.model";
import { RolePermissionModel } from "../persistence/models/role-permission.model";
import { UserRoleModel } from "../persistence/models/user-role.model";
import { UserPermissionModel } from "../persistence/models/user-permission.model";
import { SequelizeRoleRepository } from "../persistence/repositories/sequelize-role.repository";

/** Loads the current role and permission claims for authentication tokens. */
export class RoleClaimsService {
    private readonly roleRepository = new SequelizeRoleRepository();

    async getRoleNames(userId: number): Promise<string[]> {
        const roles = await this.roleRepository.findByUserId(userId);
        return roles.map((role) => role.name);
    }

    async getPermissionNames(userId: number): Promise<string[]> {
        const assignments = await UserRoleModel.findAll({
            attributes: ["roleId"],
            where: { userId },
        });
        const roleIds = [...new Set(assignments.map(({ roleId }) => roleId))];
        const mappings = roleIds.length
            ? await RolePermissionModel.findAll({
                attributes: ["permissionId"],
                where: { roleId: { [Op.in]: roleIds } },
            })
            : [];
        const permissionIds = [...new Set(mappings.map(({ permissionId }) => permissionId))];
        const rolePermissions = permissionIds.length
            ? await PermissionModel.findAll({
                attributes: ["name"],
                where: { id: { [Op.in]: permissionIds } },
            })
            : [];

        const directAssignments = await UserPermissionModel.findAll({
            attributes: ["permissionId"],
            where: { userId },
        });
        const directPermissionIds = [...new Set(directAssignments.map(({ permissionId }) => permissionId))];
        const directPermissions = directPermissionIds.length
            ? await PermissionModel.findAll({
                attributes: ["name"],
                where: { id: { [Op.in]: directPermissionIds } },
            })
            : [];

        return [...new Set([
            ...rolePermissions.map(({ name }) => name),
            ...directPermissions.map(({ name }) => name),
        ])];
    }
}
