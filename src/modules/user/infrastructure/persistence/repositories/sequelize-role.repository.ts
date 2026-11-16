import { Role } from '../../../domain/entities/role.entity';
import { RoleRepository } from '../../../domain/repositories/role.repository';

import { RoleModel } from '../models/role.model';

import { UserModel } from '../models/user.model';
import { UserRoleModel } from '../models/user-role.model';

export class SequelizeRoleRepository implements RoleRepository {
  async save(role: Role): Promise<Role> {
    const data = role.toPrimitives();

    const [model] = await RoleModel.upsert({
      id: data.id,
      name: data.name,
      description: data.description,
      isSystem: data.system,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });

    return this.toDomain(model);
  }

  async update(role: Role): Promise<Role> {
    return this.save(role);
  }

  async findById(id: number): Promise<Role | null> {
    const model = await RoleModel.findByPk(id);

    if (!model) {
      return null;
    }

    return this.toDomain(model);
  }

  async findByName(name: string): Promise<Role | null> {
    const model = await RoleModel.findOne({
      where: {
        name,
      },
    });

    if (!model) {
      return null;
    }

    return this.toDomain(model);
  }

  async findAll(filters?: { active?: boolean; system?: boolean }): Promise<Role[]> {
    const models = await RoleModel.findAll({
      where: filters?.system !== undefined ? { isSystem: filters.system } : undefined,
      order: [['name', 'ASC']],
    });

    const roles = models.map((model) => this.toDomain(model));

    // `active` não é coluna persistida — o domínio assume
    // sempre activo ao reconstituir, por isso filtra-se em memória.
    if (filters?.active !== undefined) {
      return roles.filter((role) => role.active === filters.active);
    }

    return roles;
  }

  async delete(roleId: number): Promise<void> {
    await UserRoleModel.destroy({
      where: { roleId },
    });

    await RoleModel.destroy({
      where: { id: roleId },
    });
  }

  async findByUserId(userId: number): Promise<Role[]> {
    const user = await UserModel.findByPk(userId, {
      include: [
        {
          model: RoleModel,
          as: 'roles',
        },
      ],
    });

    if (!user) {
      return [];
    }

    const roles = (user as any).roles ?? [];

    return roles.map((role: RoleModel) => this.toDomain(role));
  }

  private toDomain(model: RoleModel): Role {
    return Role.reconstitute({
      id: model.id,
      name: model.name,
      description: model.description,
      system: model.isSystem,
      active: true,
      permissions: [],
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  }

  async assignToUser(userId: number, roleId: number): Promise<void> {
    await UserRoleModel.findOrCreate({
      where: {
        userId,
        roleId,
      },
      defaults: {
        userId,
        roleId,
        createdAt: new Date(),
      },
    });
  }

  async removeFromUser(userId: number, roleId: number): Promise<void> {
    await UserRoleModel.destroy({
      where: {
        userId,
        roleId,
      },
    });
  }
}
