import { ForbiddenError, NotFoundError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { CompanyProfilePatch } from '../../domain/entities/company';
import { CompanyRepository } from '../../domain/repositories/company.repository';

export interface UpdateCompanyInput extends CompanyProfilePatch {
  companyId: number;
  actorUserId: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Actualiza o perfil da empresa do contexto de tenant. */
export class UpdateCompanyUseCase {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async execute(input: UpdateCompanyInput) {
    const saved = await this.companyRepository.mutate(input.companyId, company => {
      if (!company.status.isActive()) throw new ForbiddenError('Company is suspended.');
      company.updateProfile(input);
    });
    if (!saved) throw new NotFoundError('Company');

    const before = saved.before.toPrimitives();
    const after = saved.after.toPrimitives();

    await this.audit.record({
      companyId: after.id,
      actorUserId: input.actorUserId,
      action: 'company.updated',
      entityType: 'company',
      entityId: after.id,
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return after;
  }
}
