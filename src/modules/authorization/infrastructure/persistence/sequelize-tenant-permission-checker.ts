import { QueryTypes } from 'sequelize';

import { sequelize } from '../../../../infra/database';
import { TenantPermissionCheckerPort } from '../../application/ports/tenant-permission-checker.port';

const quoteColumn = (name: string): string =>
  sequelize.getDialect() === 'postgres' ? `"${name}"` : `\`${name}\``;

/**
 * Implementação Sequelize do verificador contextual de permissões.
 *
 * Consulta raw com JOIN explícito:
 * `company_members` → `role_permissions` → `permissions`.
 *
 * Nota de segurança: o JOIN inclui o filtro de membro ACTIVO e de
 * empresa ACTIVA — um membro suspenso ou de uma empresa suspensa
 * nunca recebe permissões, mesmo que o papel as tenha.
 */
export class SequelizeTenantPermissionChecker implements TenantPermissionCheckerPort {
  async hasPermission(userId: number, companyId: number, permission: string): Promise<boolean> {
    const rows = await sequelize.query<{ matched: number }>(
      `SELECT 1 AS matched
               FROM company_members cm
               JOIN companies c ON c.id = cm.${quoteColumn('companyId')}
               JOIN role_permissions rp ON rp.${quoteColumn('roleId')} = cm.${quoteColumn('roleId')}
               JOIN permissions p ON p.id = rp.${quoteColumn('permissionId')}
              WHERE cm.${quoteColumn('userId')} = :userId
                AND cm.${quoteColumn('companyId')} = :companyId
                AND cm.status = 'ACTIVE'
                AND c.status = 'ACTIVE'
                 AND p.scope = 'TENANT'
                 AND p.name = :permission
              LIMIT 1`,
      {
        replacements: { userId, companyId, permission },
        type: QueryTypes.SELECT,
      },
    );

    return rows.length > 0;
  }
}
