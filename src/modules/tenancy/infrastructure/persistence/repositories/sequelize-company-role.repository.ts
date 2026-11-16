import { Op, WhereOptions } from 'sequelize';

import {
  CompanyRoleRepository,
  CompanyRoleView,
} from '../../../domain/repositories/company-role.repository';
import { RoleModel } from '../../../../user/infrastructure/persistence/models/role.model';
import { PermissionModel } from '../../../../user/infrastructure/persistence/models/permission.model';
import { RolePermissionModel } from '../../../../user/infrastructure/persistence/models/role-permission.model';
import { BadRequestError } from '../../../../../shared/errors/app.error';

/**
 * Implementação Sequelize do repositório de papéis da empresa.
 *
 * Regras de âmbito:
 *  - leituras: roles próprias da empresa + roles globais (`companyId` null);
 *  - escritas: apenas roles com `companyId` igual ao contexto —
 *    roles globais do sistema nunca são editadas por esta via.
 */
export class SequelizeCompanyRoleRepository implements CompanyRoleRepository {
  async listForCompany(companyId: number): Promise<CompanyRoleView[]> {
    const roles = await RoleModel.findAll({
      where: {
        [Op.or]: [{ companyId }, { companyId: null }],
      },
      order: [
        ['companyId', 'ASC'],
        ['name', 'ASC'],
      ],
    });

    return this.withPermissions(roles);
  }

  async findById(companyId: number, roleId: number): Promise<CompanyRoleView | null> {
    const role = await RoleModel.findOne({
      where: {
        id: roleId,
        [Op.or]: [{ companyId }, { companyId: null }],
      },
    });

    if (!role) {
      return null;
    }

    const [view] = await this.withPermissions([role]);
    return view;
  }

  async existsName(companyId: number, name: string, excludeRoleId?: number): Promise<boolean> {
    const where: WhereOptions<RoleModel> = {
      companyId,
      name,
    };

    if (excludeRoleId) {
      where.id = { [Op.ne]: excludeRoleId };
    }

    const count = await RoleModel.count({ where });

    return count > 0;
  }

  async create(input: {
    companyId: number;
    name: string;
    description: string | null;
  }): Promise<CompanyRoleView> {
    const now = new Date();

    const role = await RoleModel.create({
      name: input.name,
      description: input.description,
      isSystem: false,
      companyId: input.companyId,
      createdAt: now,
      updatedAt: now,
    });

    const [view] = await this.withPermissions([role]);
    return view;
  }

  async update(input: {
    companyId: number;
    roleId: number;
    name: string;
    description: string | null;
  }): Promise<CompanyRoleView> {
    const role = await RoleModel.findOne({
      where: { id: input.roleId, companyId: input.companyId },
    });

    if (!role) {
      throw new Error('Company role not found.');
    }

    if (role.companyId === null) {
      throw new Error('System roles cannot be modified.');
    }

    role.set({
      name: input.name,
      description: input.description,
      updatedAt: new Date(),
    });

    await role.save();

    const [view] = await this.withPermissions([role]);
    return view;
  }

  async delete(companyId: number, roleId: number): Promise<void> {
    const role = await RoleModel.findOne({
      where: { id: roleId, companyId },
    });

    if (!role) {
      throw new Error('Company role not found.');
    }

    if (role.companyId === null) {
      throw new Error('System roles cannot be deleted.');
    }

    // Membros ainda usam a role: bloqueia a remoção.
    const { CompanyMemberModel } = await import('../models/company-member.model');

    const members = await CompanyMemberModel.count({
      where: { roleId, status: { [Op.ne]: 'REMOVED' } },
    });

    if (members > 0) {
      throw new Error('Company role is in use.');
    }

    await RolePermissionModel.destroy({ where: { roleId } });
    await role.destroy();
  }

  async setPermissions(
    companyId: number,
    roleId: number,
    permissionNames: string[],
  ): Promise<string[]> {
    const role = await RoleModel.findOne({
      where: { id: roleId, companyId },
    });

    if (!role) {
      throw new Error('Company role not found.');
    }

    if (role.companyId === null) {
      throw new Error('System roles cannot be modified.');
    }

    const permissions = permissionNames.length
      ? await PermissionModel.findAll({
          where: {
            name: { [Op.in]: permissionNames },
            scope: 'TENANT',
          },
          attributes: ['id', 'name'],
        })
      : [];

    const found = new Set(permissions.map((permission) => permission.name));

    const missing = permissionNames.filter((name) => !found.has(name));

    if (missing.length > 0) {
      throw new BadRequestError(
        'One or more permissions are not available in the company context.',
      );
    }

    const now = new Date();

    await RolePermissionModel.destroy({ where: { roleId } });

    if (permissions.length > 0) {
      await RolePermissionModel.bulkCreate(
        permissions.map((permission) => ({
          roleId,
          permissionId: permission.id,
          createdAt: now,
        })),
      );
    }

    return permissions.map((permission) => permission.name);
  }

  private async withPermissions(roles: RoleModel[]): Promise<CompanyRoleView[]> {
    const roleIds = roles.map((role) => role.id);

    const mappings = roleIds.length
      ? await RolePermissionModel.findAll({
          where: { roleId: { [Op.in]: roleIds } },
        })
      : [];

    const permissionIds = [...new Set(mappings.map((mapping) => mapping.permissionId))];

    const permissions = permissionIds.length
      ? await PermissionModel.findAll({
          where: { id: { [Op.in]: permissionIds } },
          attributes: ['id', 'name'],
        })
      : [];

    const byRole = new Map<number, string[]>();

    const nameById = new Map(permissions.map((permission) => [permission.id, permission.name]));

    for (const mapping of mappings) {
      const name = nameById.get(mapping.permissionId);

      if (!name) {
        continue;
      }

      const list = byRole.get(mapping.roleId) ?? [];
      list.push(name);
      byRole.set(mapping.roleId, list);
    }

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      companyId: role.companyId,
      permissionNames: (byRole.get(role.id) ?? []).sort(),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    }));
  }
}
