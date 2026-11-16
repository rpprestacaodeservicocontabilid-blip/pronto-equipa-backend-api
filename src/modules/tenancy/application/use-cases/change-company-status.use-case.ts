import { NotFoundError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { CompanyRepository } from '../../domain/repositories/company.repository';

export interface ChangeCompanyStatusInput {
  companyId: number;
  actorUserId: number;
  action: 'company.suspended' | 'company.activated';
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Suspende ou reactiva uma empresa (administração de plataforma).
 *
 * A transição de estado é validada pelo aggregate — reactivar uma
 * empresa activa ou suspender uma suspensa devolve 409.
 */
export class ChangeCompanyStatusUseCase {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async execute(input: ChangeCompanyStatusInput) {
    const company = await this.companyRepository.findById(input.companyId);

    if (!company) {
      throw new NotFoundError('Company');
    }

    const before = company.toPrimitives();

    if (input.action === 'company.suspended') {
      company.suspend();
    } else {
      company.activate();
    }

    const saved = await this.companyRepository.save(company);
    const after = saved.toPrimitives();

    await this.audit.record({
      companyId: saved.id,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: 'company',
      entityId: saved.id,
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return after;
  }
}
