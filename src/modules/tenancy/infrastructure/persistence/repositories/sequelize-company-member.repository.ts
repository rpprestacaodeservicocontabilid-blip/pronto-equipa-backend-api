import { Op, WhereOptions } from 'sequelize';

import { CompanyMember } from '../../../domain/entities/company-member';
import {
  CompanyMemberRepository,
  CompanyMemberView,
  ListMembersParams,
} from '../../../domain/repositories/company-member.repository';
import { Paginated } from '../../../domain/repositories/company.repository';
import { CompanyMemberModel } from '../models/company-member.model';
import { UserModel } from '../../../../user/infrastructure/persistence/models/user.model';
import { RoleModel } from '../../../../user/infrastructure/persistence/models/role.model';

/**
 * Implementação Sequelize do repositório de membros.
 *
 * Todas as consultas exigem `companyId` como argumento obrigatório —
 * não existe nenhuma forma de ler membros sem definir o tenant.
 */
export class SequelizeCompanyMemberRepository implements CompanyMemberRepository {
  async save(member: CompanyMember): Promise<CompanyMember> {
    const data = member.toPrimitives();

    const model =
      data.id === 0
        ? await CompanyMemberModel.create({
            companyId: data.companyId,
            userId: data.userId,
            roleId: data.roleId,
            status: data.status,
            invitedBy: data.invitedBy,
            joinedAt: data.joinedAt,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          })
        : await CompanyMemberModel.findByPk(data.id).then(async (existing) => {
            if (!existing) {
              throw new Error('Company member not found.');
            }

            existing.set({
              companyId: data.companyId,
              userId: data.userId,
              roleId: data.roleId,
              status: data.status,
              invitedBy: data.invitedBy,
              joinedAt: data.joinedAt,
              updatedAt: data.updatedAt,
            });

            return existing.save();
          });

    return CompanyMember.reconstitute({
      id: model.id,
      companyId: model.companyId,
      userId: model.userId,
      roleId: model.roleId,
      status: model.status,
      invitedBy: model.invitedBy,
      joinedAt: model.joinedAt,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  }

  async findById(companyId: number, memberId: number): Promise<CompanyMember | null> {
    const model = await CompanyMemberModel.findOne({
      where: { id: memberId, companyId },
    });

    return model ? this.toDomain(model) : null;
  }

  async findByCompanyAndUser(companyId: number, userId: number): Promise<CompanyMember | null> {
    const model = await CompanyMemberModel.findOne({
      where: { companyId, userId },
    });

    return model ? this.toDomain(model) : null;
  }

  async listByCompany(
    companyId: number,
    params: ListMembersParams,
  ): Promise<Paginated<CompanyMemberView>> {
    const where: WhereOptions<CompanyMemberModel> = {
      companyId,
      status: { [Op.ne]: 'REMOVED' },
    };

    if (params.status) {
      where.status = params.status;
    }

    const offset = (params.page - 1) * params.limit;

    const { rows, count } = await CompanyMemberModel.findAndCountAll({
      where,
      order: [['createdAt', 'ASC']],
      limit: params.limit,
      offset,
      include: [
        {
          model: UserModel,
          as: 'user',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
        {
          model: RoleModel,
          as: 'role',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
    });

    return {
      rows: rows.map((model) => {
        const user = model.get('user') as UserModel | null;
        const role = model.get('role') as RoleModel | null;

        return {
          member: this.toDomain(model),
          userName: user?.name ?? null,
          userEmail: user?.email ?? null,
          roleName: role?.name ?? null,
        };
      }),
      total: count,
    };
  }

  async countActiveWithRole(companyId: number, roleIds: number[]): Promise<number> {
    if (roleIds.length === 0) {
      return 0;
    }

    return CompanyMemberModel.count({
      where: {
        companyId,
        status: 'ACTIVE',
        roleId: { [Op.in]: roleIds },
      },
    });
  }

  async countActive(companyId: number): Promise<number> {
    return CompanyMemberModel.count({
      where: { companyId, status: 'ACTIVE' },
    });
  }

  private toDomain(model: CompanyMemberModel): CompanyMember {
    return CompanyMember.reconstitute({
      id: model.id,
      companyId: model.companyId,
      userId: model.userId,
      roleId: model.roleId,
      status: model.status,
      invitedBy: model.invitedBy,
      joinedAt: model.joinedAt,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  }
}
