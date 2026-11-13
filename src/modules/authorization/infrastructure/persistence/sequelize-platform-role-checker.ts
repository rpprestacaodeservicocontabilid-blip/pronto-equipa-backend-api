import { QueryTypes } from 'sequelize';

import { sequelize } from '../../../../infra/database';
import { PlatformPermissionCheckerPort } from '../../application/ports/platform-permission-checker.port';
import { PlatformRoleCheckerPort } from '../../application/ports/platform-role-checker.port';

export class SequelizePlatformRoleChecker
  implements PlatformRoleCheckerPort, PlatformPermissionCheckerPort
{
  async hasAnyRole(userId: number, roles: readonly string[]): Promise<boolean> {
    if (!roles.length) {
      return false;
    }

    const rows = await sequelize.query<{ matched: number }>(
      `SELECT 1 AS matched
               FROM user_roles ur
               JOIN roles r ON r.id = ur.roleId
              WHERE ur.userId = :userId
                AND r.companyId IS NULL
                AND UPPER(r.name) IN (:roles)
              LIMIT 1`,
      {
        replacements: {
          userId,
          roles: roles.map((role) => role.toUpperCase()),
        },
        type: QueryTypes.SELECT,
      },
    );

    return rows.length > 0;
  }

  async hasPermission(userId: number, permission: string): Promise<boolean> {
    const rows = await sequelize.query<{ matched: number }>(
      `SELECT 1 AS matched
               FROM user_roles ur
               JOIN roles r ON r.id = ur.roleId
               JOIN role_permissions rp ON rp.roleId = r.id
               JOIN permissions p ON p.id = rp.permissionId
              WHERE ur.userId = :userId
                AND r.companyId IS NULL
                AND p.scope = 'PLATFORM'
                AND p.name = :permission
              LIMIT 1`,
      {
        replacements: { userId, permission },
        type: QueryTypes.SELECT,
      },
    );

    return rows.length > 0;
  }
}
