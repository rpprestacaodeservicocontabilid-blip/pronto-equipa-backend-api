import { Op, WhereOptions } from 'sequelize';

import { Permission } from '../../../domain/entities/permission.entity';
import { PermissionScope } from '../../../domain/enums/permission-scope.enum';
import { PermissionRepository } from '../../../domain/repositories/permission.repository';

import { PermissionModel } from '../models/permission.model';

import { RoleModel } from '../models/role.model';

import { UserModel } from '../models/user.model';

import { RolePermissionModel } from '../models/role-permission.model';

import { UserPermissionModel } from '../models/user-permission.model';

export class SequelizePermissionRepository implements PermissionRepository {
  async save(permission: Permission): Promise<Permission> {
    const data = permission.toPrimitives();

    const [model] = await PermissionModel.upsert({
      id: data.id,
      name: data.name,
      description: data.description,
      resource: data.resource,
      action: data.action,
      scope: data.scope,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });

    return this.toDomain(model);
  }

  async update(permission: Permission): Promise<Permission> {
    return this.save(permission);
  }

  async findById(id: number): Promise<Permission | null> {
    const model = await PermissionModel.findByPk(id);

    if (!model) {
      return null;
    }

    return this.toDomain(model);
  }

  async findByName(name: string): Promise<Permission | null> {
    const model = await PermissionModel.findOne({
      where: {
        name,
      },
    });

    if (!model) {
      return null;
    }

    return this.toDomain(model);
  }

  async findByRoleId(roleId: number): Promise<Permission[]> {
    const mappings = await RolePermissionModel.findAll({
      where: { roleId },
    });

    const permissionIds = [...new Set(mappings.map((mapping) => mapping.permissionId))];

    if (permissionIds.length === 0) {
      return [];
    }

    const models = await PermissionModel.findAll({
      where: {
        id: {
          [Op.in]: permissionIds,
        },
      },
      order: [['name', 'ASC']],
    });

    return models.map((model) => this.toDomain(model));
  }

  async findAll(filters?: {
    resource?: string;
    action?: string;
    active?: boolean;
  }): Promise<Permission[]> {
    const where: WhereOptions<PermissionModel> = {};

    if (filters?.resource) {
      where.resource = filters.resource;
    }

    if (filters?.action) {
      where.action = filters.action;
    }

    const models = await PermissionModel.findAll({
      where,
      order: [['name', 'ASC']],
    });

    const permissions = models.map((model) => this.toDomain(model));

    // `active` não é coluna persistida — o domínio assume
    // sempre activo ao reconstituir, por isso filtra-se em memória.
    if (filters?.active !== undefined) {
      return permissions.filter((permission) => permission.active === filters.active);
    }

    return permissions;
  }

  async delete(permissionId: number): Promise<void> {
    await UserPermissionModel.destroy({
      where: { permissionId },
    });

    await RolePermissionModel.destroy({
      where: { permissionId },
    });

    await PermissionModel.destroy({
      where: { id: permissionId },
    });
  }

  private toDomain(model: PermissionModel): Permission {
    return Permission.reconstitute({
      id: model.id,
      name: model.name,
      description: model.description,
      resource: model.resource,
      action: model.action,
      scope: model.scope as PermissionScope,
      active: true,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  }

  async findByUserId(userId: number): Promise<Permission[]> {
    const user = await UserModel.findByPk(userId, {
      include: [
        {
          model: RoleModel,
          as: 'roles',
          include: [
            {
              model: PermissionModel,
              as: 'permissions',
            },
          ],
        },
      ],
    });

    if (!user) {
      return [];
    }

    const roles = (user as any).roles ?? [];

    const permissions = roles.flatMap((role: RoleModel) => (role as any).permissions ?? []);

    const unique = new Map<number, PermissionModel>();

    for (const permission of permissions) {
      unique.set(permission.id, permission);
    }

    return Array.from(unique.values()).map((permission) => this.toDomain(permission));
  }

  async findDirectByUserId(userId: number): Promise<Permission[]> {
    const models = await PermissionModel.findAll({
      include: [
        {
          association: 'users',
          where: { id: userId },
          required: true,
        },
      ],
    });

    return models.map((model) => this.toDomain(model));
  }

  async assignToUser(
    userId: number,
    permissionId: number,
    assignedBy?: number | null,
  ): Promise<void> {
    await UserPermissionModel.findOrCreate({
      where: {
        userId,
        permissionId,
      },
      defaults: {
        userId,
        permissionId,
        assignedBy: assignedBy ?? null,
        createdAt: new Date(),
      },
    });
  }

  async removeFromUser(userId: number, permissionId: number): Promise<void> {
    await UserPermissionModel.destroy({
      where: {
        userId,
        permissionId,
      },
    });
  }
}
