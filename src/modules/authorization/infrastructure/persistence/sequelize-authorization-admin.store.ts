import { Op, col, fn, where as matches } from 'sequelize';
import { NotFoundError } from '../../../../shared/errors/app.error';
import { CompanyModel } from '../../../tenancy/infrastructure/persistence/models/company.model';
import { CompanyMemberModel } from '../../../tenancy/infrastructure/persistence/models/company-member.model';
import { PermissionModel } from '../../../user/infrastructure/persistence/models/permission.model';
import { RoleModel } from '../../../user/infrastructure/persistence/models/role.model';
import { RolePermissionModel } from '../../../user/infrastructure/persistence/models/role-permission.model';
import { UserRoleModel } from '../../../user/infrastructure/persistence/models/user-role.model';
import { UserModel } from '../../../user/infrastructure/persistence/models/user.model';

type Scope = 'PLATFORM' | 'TENANT' | 'GLOBAL';
interface PageQuery { page: number; search?: string }
const limit = 25;
const pagination = (page: number, total: number) => ({ page, limit, total });
const permissionAttributes = ['id', 'name', 'description', 'resource', 'action', 'scope'];
const rolesWhere = (companyId: number | null) => companyId === null
  ? { companyId: null }
  : { [Op.or]: [{ companyId }, { companyId: null }] };

export class SequelizeAuthorizationAdminStore {
  async overview() {
    const [platformRoles, companyRoles, permissions, platformAssignments] = await Promise.all([
      RoleModel.count({ where: { companyId: null } }),
      RoleModel.count({ where: { companyId: { [Op.ne]: null } } }),
      PermissionModel.count(),
      this.platformRoleIds().then(roleId => UserRoleModel.count({ where: { roleId } })),
    ]);
    return { platformRoles, companyRoles, permissions, platformAssignments };
  }

  async listPermissions({ page, search, scope }: PageQuery & { scope?: Scope }) {
    const term = '%' + search?.toLowerCase() + '%';
    const { rows, count } = await PermissionModel.findAndCountAll({
      where: {
        ...(scope ? { scope } : {}),
        ...(search ? { [Op.or]: ['name', 'resource', 'action'].map(field =>
          matches(fn('lower', col(field)), { [Op.like]: term })) } : {}),
      },
      attributes: permissionAttributes,
      order: [['name', 'ASC'], ['id', 'ASC']],
      offset: (page - 1) * limit,
      limit,
    });
    return { items: rows, ...pagination(page, count) };
  }

  async listRoles({ page, search }: PageQuery, companyId: number | null) {
    if (companyId !== null) await this.company(companyId);
    const { rows, count } = await RoleModel.findAndCountAll({
      where: {
        ...rolesWhere(companyId),
        ...(search ? { [Op.and]: matches(fn('lower', col('name')), { [Op.like]: '%' + search.toLowerCase() + '%' }) } : {}),
      },
      order: [['name', 'ASC'], ['id', 'ASC']],
      offset: (page - 1) * limit,
      limit,
    });
    return { items: await this.presentRoles(rows, companyId), ...pagination(page, count) };
  }

  async assignedRoles(userId: number, companyId: number | null) {
    const user = await this.user(userId);
    if (companyId !== null) await this.company(companyId);
    const membership = companyId === null ? null : await CompanyMemberModel.findOne({
      where: { userId, companyId }, attributes: ['roleId', 'status'],
    });
    const roleIds = companyId === null
      ? (await UserRoleModel.findAll({ where: { userId }, attributes: ['roleId'] })).map(entry => entry.roleId)
      : membership ? [membership.roleId] : [];
    const roles = await RoleModel.findAll({
      where: { ...rolesWhere(companyId), id: roleIds },
      order: [['name', 'ASC'], ['id', 'ASC']],
    });
    return {
      user: { id: user.id, name: user.name, email: user.email, status: user.status, disabled: !!user.identityDisabledAt },
      membershipStatus: membership?.status ?? null,
      roles: await this.presentRoles(roles, companyId),
    };
  }

  async user(id: number) {
    const user = await UserModel.findByPk(id, { attributes: ['id', 'name', 'email', 'status', 'identityDisabledAt'] });
    if (!user) throw new NotFoundError('User');
    return user;
  }

  async company(id: number) {
    const company = await CompanyModel.findByPk(id, { attributes: ['id', 'status'] });
    if (!company) throw new NotFoundError('Company');
    return company;
  }

  async permission(id: number) {
    const permission = await PermissionModel.findByPk(id, { attributes: permissionAttributes });
    if (!permission) throw new NotFoundError('Permission');
    return permission;
  }

  private async platformRoleIds() {
    return (await RoleModel.findAll({ attributes: ['id'], where: { companyId: null } })).map(role => role.id);
  }

  private async presentRoles(roles: RoleModel[], companyId: number | null) {
    const { links, permissions } = await this.permissionsFor(roles.map(role => role.id), companyId === null ? undefined : 'TENANT');
    const permissionsById = new Map(permissions.map(item => [item.id, item]));
    const byRole = new Map<number, PermissionModel[]>();
    for (const link of links) {
      const permission = permissionsById.get(link.permissionId);
      if (!permission) continue;
      const group = byRole.get(link.roleId) ?? [];
      group.push(permission);
      byRole.set(link.roleId, group);
    }
    return roles.map(role => ({
      id: role.id, name: role.name, description: role.description, companyId: role.companyId, isSystem: role.isSystem,
      permissions: (byRole.get(role.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }

  private async permissionsFor(roleIds: number[], scope?: Scope) {
    const links = await RolePermissionModel.findAll({
      where: { roleId: roleIds }, attributes: ['roleId', 'permissionId'],
    });
    const permissions = await PermissionModel.findAll({
      where: { id: [...new Set(links.map(link => link.permissionId))], ...(scope ? { scope } : {}) },
      attributes: permissionAttributes,
    });
    return { links, permissions };
  }
}
