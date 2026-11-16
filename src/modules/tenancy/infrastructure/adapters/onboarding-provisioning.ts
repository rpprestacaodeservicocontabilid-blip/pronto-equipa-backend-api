import { z } from 'zod';

import { sequelize } from '../../../../infra/database/index';
import { CompanyModel } from '../persistence/models/company.model';
import { CompanyMemberModel } from '../persistence/models/company-member.model';
import { RoleModel } from '../../../user/infrastructure/persistence/models/role.model';
import { PermissionModel } from '../../../user/infrastructure/persistence/models/permission.model';
import { RolePermissionModel } from '../../../user/infrastructure/persistence/models/role-permission.model';

const onboardingCompanySchema = z.object({
  name: z.string().trim().min(1),
  taxId: z.string().trim().min(1),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
});
export class OnboardingTenantProvisioning {
  async provision(input: {
    applicationId: string;
    actor: number;
    company: unknown;
    settings: unknown;
  }) {
    const companyInput = onboardingCompanySchema.parse(input.company);
    const settings = z.record(z.string(), z.unknown()).default({}).parse(input.settings);
    return sequelize.transaction(async (tx) => {
      if (sequelize.getDialect() === 'postgres')
        await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:taxId))', {
          replacements: { taxId: companyInput.taxId },
          transaction: tx,
        });
      const slug = `onboarding-${input.applicationId}`;
      const existing = await CompanyModel.findOne({ where: { slug }, transaction: tx });
      if (existing) return existing.id;
      const duplicate = await CompanyModel.findOne({
        where: { nif: companyInput.taxId },
        transaction: tx,
      });
      if (duplicate)
        throw Object.assign(new Error('NIF já associado a uma empresa; revisão necessária.'), {
          statusCode: 409,
        });
      const company = await CompanyModel.create(
        {
          name: companyInput.name,
          slug,
          nif: companyInput.taxId,
          email: companyInput.email,
          phone: companyInput.phone || null,
          status: 'PENDING',
          timezone: 'Africa/Luanda',
          locale: 'pt-AO',
          settings: { onboardingId: input.applicationId, ...settings },
        },
        { transaction: tx },
      );
      const role = await RoleModel.create(
        {
          name: `ONBOARDING_ADMIN_${company.id}`,
          companyId: company.id,
          isSystem: true,
          description: 'Administrador inicial da empresa',
        },
        { transaction: tx },
      );
      const permissions = await PermissionModel.findAll({
        where: { scope: 'TENANT' },
        transaction: tx,
      });
      if (permissions.length)
        await RolePermissionModel.bulkCreate(
          permissions.map((p) => ({ roleId: role.id, permissionId: p.id, createdAt: new Date() })),
          { transaction: tx },
        );
      await CompanyMemberModel.create(
        {
          companyId: company.id,
          userId: input.actor,
          roleId: role.id,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        { transaction: tx },
      );
      return company.id;
    });
  }
  async activate(companyId: number, applicationId: string) {
    return sequelize.transaction(async (tx) => {
      const company = await CompanyModel.findByPk(companyId, {
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });
      if (!company || company.settings?.onboardingId !== applicationId)
        throw new Error('Provisionamento incompatível.');
      if (!['PENDING', 'ACTIVE'].includes(company.status))
        throw new Error('Empresa suspensa ou indisponível.');
      await company.update({ status: 'ACTIVE' }, { transaction: tx });
    });
  }
}
