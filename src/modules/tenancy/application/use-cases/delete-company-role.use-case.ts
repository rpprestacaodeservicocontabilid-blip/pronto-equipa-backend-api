import { BadRequestError, NotFoundError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { CompanyRoleRepository } from '../../domain/repositories/company-role.repository';

export interface DeleteCompanyRoleInput {
  companyId: number;
  roleId: number;
  actorUserId: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Apaga um papel próprio da empresa.
 *
 * Papéis do sistema e papéis ainda em uso por membros devolvem 400.
 */
export class DeleteCompanyRoleUseCase {
  constructor(
    private readonly roleRepository: CompanyRoleRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async execute(input: DeleteCompanyRoleInput) {
    const role = await this.roleRepository.findById(input.companyId, input.roleId);

    if (!role) {
      throw new NotFoundError('Company role');
    }

    if (role.isSystem || role.companyId === null) {
      throw new BadRequestError('System roles cannot be deleted.');
    }

    try {
      await this.roleRepository.delete(input.companyId, input.roleId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Company role.';

      if (/in use\.?$/i.test(message)) {
        throw new BadRequestError('Company role is in use by active members.');
      }

      throw error;
    }

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'company.role.deleted',
      entityType: 'company_role',
      entityId: input.roleId,
      before: role as unknown as Record<string, unknown>,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return { deleted: true };
  }
}
