import { NotFoundError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { CompanyRepository } from '../../domain/repositories/company.repository';

export interface ChangeCompanyStatusInput {
  companyId: number;
  actorUserId: number;
  action: 'company.suspended' | 'company.activated';
  reason?: string;
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
    const saved = await this.companyRepository.mutate(input.companyId, company => {

      if (input.action === 'company.suspended') {
        company.suspend();
      } else {
        company.activate();
      }
    });
    if (!saved) throw new NotFoundError('Company');
    const before = saved.before.toPrimitives();
    const after = saved.after.toPrimitives();

    await this.audit.record({
      companyId: after.id,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: 'company',
      entityId: after.id,
      before: before as unknown as Record<string, unknown>,
      after: { ...after, ...(input.reason ? { reason: input.reason } : {}) },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return after;
  }
}
