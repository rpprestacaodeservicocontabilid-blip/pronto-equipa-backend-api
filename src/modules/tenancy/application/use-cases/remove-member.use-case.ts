import { BadRequestError, NotFoundError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { CompanyMemberRepository } from '../../domain/repositories/company-member.repository';
import { CompanyAccessDirectoryPort } from '../ports/company-access-directory.port';

export interface RemoveMemberInput {
  companyId: number;
  memberId: number;
  actorUserId: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Remove (logicamente) um membro da empresa.
 *
 * O registo nunca é apagado — passa a estado `REMOVED` para
 * preservar o histórico de auditoria.
 */
export class RemoveMemberUseCase {
  constructor(
    private readonly memberRepository: CompanyMemberRepository,
    private readonly audit: AuditRecorderPort,
    private readonly directory: CompanyAccessDirectoryPort,
  ) {}

  async execute(input: RemoveMemberInput) {
    const member = await this.memberRepository.findById(input.companyId, input.memberId);

    if (!member) {
      throw new NotFoundError('Company member');
    }

    await this.guardLastAdmin(input.companyId, member.roleId);

    const before = member.toPrimitives();

    member.remove();

    const saved = await this.memberRepository.save(member);
    const after = saved.toPrimitives();

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'company.member.removed',
      entityType: 'company_member',
      entityId: saved.id,
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return after;
  }

  private async guardLastAdmin(companyId: number, currentRoleId: number): Promise<void> {
    const adminRoleIds = await this.directory.administrativeRoleIds(companyId);

    if (!adminRoleIds.includes(currentRoleId)) {
      return;
    }

    const activeAdmins = await this.memberRepository.countActiveWithRole(companyId, adminRoleIds);

    if (activeAdmins <= 1) {
      throw new BadRequestError('Company must keep at least one active admin.');
    }
  }
}
