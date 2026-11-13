import { QueryTypes } from "sequelize";

import { sequelize } from "../../../../../infra/database";
import {
    MembershipReaderPort,
    MembershipSummary,
} from "../../../application/ports/membership-reader.port";

const quoteColumn = (name: string): string => sequelize.getDialect() === 'postgres' ? `"${name}"` : `\`${name}\``;

/**
 * Adapter Sequelize do `MembershipReaderPort`.
 *
 * Usa consultas raw com JOIN explícito
 * (`company_members` → `roles` → `role_permissions` → `permissions`)
 * para resolver o papel e as permissões do membro DENTRO da empresa.
 *
 * Todas as consultas exigem o par `(companyId, userId)` — nunca se
 * resolve um vínculo sem âmbito de tenant.
 */
export class SequelizeMembershipReader
    implements MembershipReaderPort {
    async findMembership(
        companyId: number,
        userId: number,
    ): Promise<MembershipSummary | null> {
        const rows = await sequelize.query<{
            companyId: number;
            userId: number;
            roleId: number;
            memberStatus: string;
            companyStatus: string;
        }>(
            `SELECT cm.${quoteColumn('companyId')},
                    cm.${quoteColumn('userId')},
                    cm.${quoteColumn('roleId')},
                    cm.status AS ${quoteColumn('memberStatus')},
                    c.status AS ${quoteColumn('companyStatus')}
               FROM company_members cm
               JOIN companies c ON c.id = cm.${quoteColumn('companyId')}
              WHERE cm.${quoteColumn('companyId')} = :companyId
                AND cm.${quoteColumn('userId')} = :userId
              LIMIT 1`,
            {
                replacements: { companyId, userId },
                type: QueryTypes.SELECT,
            },
        );

        const row = rows[0];

        if (!row) {
            return null;
        }

        return {
            companyId: Number(row.companyId),
            userId: Number(row.userId),
            roleId: Number(row.roleId),
            memberStatus: String(row.memberStatus),
            companyStatus: String(row.companyStatus),
        };
    }

    async findPermissionNames(
        companyId: number,
        userId: number,
    ): Promise<string[]> {
        const rows = await sequelize.query<{ permissionName: string }>(
            `SELECT DISTINCT p.name AS ${quoteColumn('permissionName')}
               FROM company_members cm
               JOIN role_permissions rp ON rp.${quoteColumn('roleId')} = cm.${quoteColumn('roleId')}
               JOIN permissions p ON p.id = rp.${quoteColumn('permissionId')}
              WHERE cm.${quoteColumn('companyId')} = :companyId
                AND cm.${quoteColumn('userId')} = :userId
                AND cm.status = 'ACTIVE'`,
            {
                replacements: { companyId, userId },
                type: QueryTypes.SELECT,
            },
        );

        return rows.map((row) => String(row.permissionName));
    }

    async findActiveCompanyIds(
        userId: number,
    ): Promise<number[]> {
        const rows = await sequelize.query<{ companyId: number }>(
            `SELECT cm.${quoteColumn('companyId')}
               FROM company_members cm
               JOIN companies c ON c.id = cm.${quoteColumn('companyId')}
              WHERE cm.${quoteColumn('userId')} = :userId
                AND cm.status = 'ACTIVE'
                AND c.status = 'ACTIVE'`,
            {
                replacements: { userId },
                type: QueryTypes.SELECT,
            },
        );

        return rows.map((row) => Number(row.companyId));
    }
}

