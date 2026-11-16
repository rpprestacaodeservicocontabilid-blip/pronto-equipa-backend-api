import { CompanyAccessDirectoryPort } from '../ports/company-access-directory.port';
import { ConflictError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { Company } from '../../domain/entities/company';
import { CompanyMember } from '../../domain/entities/company-member';
import { CompanyRepository } from '../../domain/repositories/company.repository';
import { CompanyMemberRepository } from '../../domain/repositories/company-member.repository';
import { Slug } from '../../domain/value-objects/slug';

export interface CreateCompanyInput {
  /** Criador — passa a ser o primeiro membro com papel de admin. */
  actorUserId: number;
  name: string;
  slug?: string | null;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  timezone?: string;
  locale?: string;
  /** Papel (role global ou da empresa) atribuído ao criador. */
  adminRoleId?: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Cria uma empresa (tenant) e o vínculo do criador como admin.
 *
 * A criação do slug é feita com desambiguação automática
 * (`acme`, `acme-2`, `acme-3`, ...) para não falhar em colisões.
 */
export class CreateCompanyUseCase {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly memberRepository: CompanyMemberRepository,
    private readonly audit: AuditRecorderPort,
    private readonly directory: CompanyAccessDirectoryPort,
  ) {}

  async execute(input: CreateCompanyInput) {
    const adminRoleId = input.adminRoleId ?? (await this.directory.globalAdminRoleId());
    const requestedSlug = input.slug?.trim() ? Slug.parse(input.slug) : Slug.fromName(input.name);

    const slug = await this.resolveSlug(requestedSlug);

    const company = Company.create({
      name: input.name,
      slug: slug.value,
      nif: input.nif,
      email: input.email,
      phone: input.phone,
      timezone: input.timezone,
      locale: input.locale,
    });

    const saved = await this.companyRepository.save(company);

    // Primeiro membro: admin da empresa.
    const member = CompanyMember.create({
      companyId: saved.id,
      userId: input.actorUserId,
      roleId: adminRoleId,
      invitedBy: input.actorUserId,
    });

    await this.memberRepository.save(member);

    await this.audit.record({
      companyId: saved.id,
      actorUserId: input.actorUserId,
      action: 'company.created',
      entityType: 'company',
      entityId: saved.id,
      after: saved.toPrimitives() as unknown as Record<string, unknown>,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return saved.toPrimitives();
  }

  /** Procura o primeiro slug livre com sufixo numérico. */
  private async resolveSlug(base: Slug): Promise<Slug> {
    if (!(await this.companyRepository.existsBySlug(base.value))) {
      return base;
    }

    for (let suffix = 2; suffix <= 1000; suffix += 1) {
      const candidate = base.withSuffix(suffix);

      if (!(await this.companyRepository.existsBySlug(candidate.value))) {
        return candidate;
      }
    }

    throw new ConflictError('Slug already exists.');
  }
}
