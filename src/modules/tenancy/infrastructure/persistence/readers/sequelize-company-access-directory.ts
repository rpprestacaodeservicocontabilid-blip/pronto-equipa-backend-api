import { Op } from 'sequelize';
import { CompanyAccessDirectoryPort } from '../../../application/ports/company-access-directory.port';
import { UserModel } from '../../../../user/infrastructure/persistence/models/user.model';
import { RoleModel } from '../../../../user/infrastructure/persistence/models/role.model';

export class SequelizeCompanyAccessDirectory implements CompanyAccessDirectoryPort {
  async globalAdminRoleId(): Promise<number> {
    const role = await RoleModel.findOne({
      where: { name: 'ADMIN', companyId: null },
      attributes: ['id'],
    });
    if (!role) throw new Error('System role ADMIN not found.');
    return role.id;
  }
  async userExists(userId: number): Promise<boolean> {
    return Boolean(await UserModel.findByPk(userId, { attributes: ['id'] }));
  }

  async administrativeRoleIds(companyId: number): Promise<number[]> {
    const roles = await RoleModel.findAll({
      where: {
        [Op.or]: [
          { companyId: null, name: { [Op.in]: ['ADMIN', 'SUPER_ADMIN'] } },
          { companyId, name: `ONBOARDING_ADMIN_${companyId}`, isSystem: true },
        ],
      },
      attributes: ['id'],
    });
    return roles.map((role) => role.id);
  }
}
