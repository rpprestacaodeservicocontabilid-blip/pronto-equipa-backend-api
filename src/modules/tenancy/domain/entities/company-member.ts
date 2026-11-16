import { ConflictError } from '../../../../shared/errors/app.error';
import { MemberStatus } from '../value-objects/member-status';

export interface CompanyMemberProps {
  id: number;
  companyId: number;
  userId: number;
  roleId: number;
  status: MemberStatus;
  invitedBy: number | null;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCompanyMemberProps {
  companyId: number;
  userId: number;
  roleId: number;
  invitedBy?: number | null;
}

export interface CompanyMemberPrimitives {
  id: number;
  companyId: number;
  userId: number;
  roleId: number;
  status: string;
  invitedBy: number | null;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Entity — Membro de uma empresa (tenant).
 *
 * O papel (`roleId`) é o papel exercido DENTRO desta empresa.
 */
export class CompanyMember {
  private constructor(private props: CompanyMemberProps) {}

  static create(props: CreateCompanyMemberProps): CompanyMember {
    const now = new Date();

    return new CompanyMember({
      id: 0,
      companyId: props.companyId,
      userId: props.userId,
      roleId: props.roleId,
      status: MemberStatus.active(),
      invitedBy: props.invitedBy ?? null,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(
    props: Omit<CompanyMemberProps, 'status'> & { status: string },
  ): CompanyMember {
    return new CompanyMember({
      ...props,
      status: MemberStatus.from(props.status),
    });
  }

  get id(): number {
    return this.props.id;
  }

  get companyId(): number {
    return this.props.companyId;
  }

  get userId(): number {
    return this.props.userId;
  }

  get roleId(): number {
    return this.props.roleId;
  }

  get status(): MemberStatus {
    return this.props.status;
  }

  assignId(id: number): void {
    this.props.id = id;
  }

  /** Altera o papel exercido dentro da empresa. */
  changeRole(roleId: number): void {
    if (this.props.status.isRemoved()) {
      throw new ConflictError('Member is no longer active.');
    }

    this.props.roleId = roleId;
    this.props.updatedAt = new Date();
  }

  suspend(): void {
    if (this.props.status.isRemoved()) {
      throw new ConflictError('Member is no longer active.');
    }

    this.props.status = MemberStatus.suspended();
    this.props.updatedAt = new Date();
  }

  activate(): void {
    if (this.props.status.isRemoved()) {
      throw new ConflictError('Member is no longer active.');
    }

    this.props.status = MemberStatus.active();
    this.props.updatedAt = new Date();
  }

  /** Remoção lógica — mantém o registo para auditoria. */
  remove(): void {
    if (this.props.status.isRemoved()) {
      throw new ConflictError('Member already removed.');
    }

    this.props.status = MemberStatus.removed();
    this.props.updatedAt = new Date();
  }

  toPrimitives(): CompanyMemberPrimitives {
    return {
      id: this.props.id,
      companyId: this.props.companyId,
      userId: this.props.userId,
      roleId: this.props.roleId,
      status: this.props.status.value,
      invitedBy: this.props.invitedBy,
      joinedAt: this.props.joinedAt,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }
}
