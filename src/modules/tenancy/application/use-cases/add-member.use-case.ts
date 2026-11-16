import { ConflictError, NotFoundError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { CompanyMember } from '../../domain/entities/company-member';
import { CompanyMemberRepository } from '../../domain/repositories/company-member.repository';
import { CompanyAccessDirectoryPort } from '../ports/company-access-directory.port';

export interface AddMemberInput {
  companyId: number;
  actorUserId: number;
  userId: number;
  roleId: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Adiciona um utilizador à empresa com um papel específico.
 *
 * Valida que o utilizador existe e que ainda não é membro activo
 * da empresa (o índice único `companyId+userId` também protege).
 */
export class AddMemberUseCase {
  constructor(
    private readonly memberRepository: CompanyMemberRepository,
    private readonly audit: AuditRecorderPort,
    private readonly directory: CompanyAccessDirectoryPort,
  ) {}

  async execute(input: AddMemberInput) {
    const user = await this.directory.userExists(input.userId);

    if (!user) {
      throw new NotFoundError('User');
    }

    const existing = await this.memberRepository.findByCompanyAndUser(
      input.companyId,
      input.userId,
    );

    if (existing && !existing.status.isRemoved()) {
      throw new ConflictError('User already exists in this company.');
    }

    const member = CompanyMember.create({
      companyId: input.companyId,
      userId: input.userId,
      roleId: input.roleId,
      invitedBy: input.actorUserId,
    });

    const saved = await this.memberRepository.save(member);

    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'company.member.added',
      entityType: 'company_member',
      entityId: saved.id,
      after: saved.toPrimitives() as unknown as Record<string, unknown>,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return saved.toPrimitives();
  }
}
