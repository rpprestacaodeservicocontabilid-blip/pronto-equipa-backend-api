import { RecentUsersReaderPort } from '../../../application/ports/recent-users-reader.port';
import { UserType } from '../../../domain/enums/user-type.enum';
import { RoleModel } from '../models/role.model';
import { UserRoleModel } from '../models/user-role.model';
import { UserModel } from '../models/user.model';
export class SequelizeRecentUsersReader implements RecentUsersReaderPort {
  async list(input: { limit: number; type?: UserType }) {
    const users = await UserModel.findAll({
      where: input.type ? { type: input.type } : undefined,
      order: [['createdAt', 'DESC']],
      limit: input.limit,
    });
    const userIds = users.map((user) => user.id);
    const userRoles = userIds.length
      ? await UserRoleModel.findAll({ where: { userId: userIds } })
      : [];
    const roleIds = [...new Set(userRoles.map((role) => role.roleId))];
    const roles = roleIds.length ? await RoleModel.findAll({ where: { id: roleIds } }) : [];
    const names = new Map(roles.map((role) => [role.id, role.name]));
    const rolesByUser = new Map<number, string[]>();
    for (const role of userRoles) {
      const name = names.get(role.roleId);
      if (!name) continue;
      const list = rolesByUser.get(role.userId) || [];
      list.push(name);
      rolesByUser.set(role.userId, list);
    }
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      type: user.type,
      status: user.status,
      primaryRole: rolesByUser.get(user.id)?.[0] || null,
      createdAt: user.createdAt,
    }));
  }
}
