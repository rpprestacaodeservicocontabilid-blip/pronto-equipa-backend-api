import { BadRequestError } from '../../../../shared/errors/app.error';
import { ConflictError } from '../../../../shared/errors/app.error';
import { CompanyStatus } from '../value-objects/company-status';

export interface CompanyProps {
  id: number;
  name: string;
  slug: string;
  nif: string | null;
  email: string | null;
  phone: string | null;
  status: CompanyStatus;
  timezone: string;
  locale: string;
  settings: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCompanyProps {
  name: string;
  slug: string;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  timezone?: string;
  locale?: string;
  settings?: Record<string, unknown> | null;
}

export interface CompanyProfilePatch {
  name?: string;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  timezone?: string;
  locale?: string;
}

export interface CompanyPrimitives {
  id: number;
  name: string;
  slug: string;
  nif: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  timezone: string;
  locale: string;
  settings: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Aggregate Root — Empresa (tenant).
 *
 * Toda a regra de negócio de transição de estado vive aqui; a
 * persistência apenas espelha os primitivos.
 */
export class Company {
  private constructor(private props: CompanyProps) {}

  static create(props: CreateCompanyProps): Company {
    const name = String(props.name ?? '').trim();

    if (!name) {
      throw new BadRequestError('Company name is required.');
    }

    if (name.length > 150) {
      throw new BadRequestError('Company name must not exceed 150 characters.');
    }

    const now = new Date();

    return new Company({
      id: 0,
      name,
      slug: props.slug,
      nif: normalize(props.nif),
      email: normalize(props.email),
      phone: normalize(props.phone),
      status: CompanyStatus.active(),
      timezone: props.timezone?.trim() || 'Africa/Luanda',
      locale: props.locale?.trim() || 'pt-AO',
      settings: props.settings ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: Omit<CompanyProps, 'status'> & { status: string }): Company {
    return new Company({
      ...props,
      status: CompanyStatus.from(props.status),
    });
  }

  get id(): number {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): string {
    return this.props.slug;
  }

  get status(): CompanyStatus {
    return this.props.status;
  }

  /** Atribui o id devolvido pela persistência (após criação). */
  assignId(id: number): void {
    this.props.id = id;
  }

  updateProfile(patch: CompanyProfilePatch): void {
    if (patch.name !== undefined) {
      const name = String(patch.name).trim();

      if (!name) {
        throw new BadRequestError('Company name is required.');
      }

      if (name.length > 150) {
        throw new BadRequestError('Company name must not exceed 150 characters.');
      }

      this.props.name = name;
    }

    if (patch.nif !== undefined) {
      this.props.nif = normalize(patch.nif);
    }

    if (patch.email !== undefined) {
      this.props.email = normalize(patch.email);
    }

    if (patch.phone !== undefined) {
      this.props.phone = normalize(patch.phone);
    }

    if (patch.timezone !== undefined) {
      this.props.timezone = String(patch.timezone).trim() || 'Africa/Luanda';
    }

    if (patch.locale !== undefined) {
      this.props.locale = String(patch.locale).trim() || 'pt-AO';
    }

    this.props.updatedAt = new Date();
  }

  suspend(): void {
    if (!this.props.status.canSuspend()) {
      throw new ConflictError('Company is already suspended.');
    }

    this.props.status = CompanyStatus.suspended();
    this.props.updatedAt = new Date();
  }

  activate(): void {
    if (!this.props.status.canActivate()) {
      throw new ConflictError('Company is already active.');
    }

    this.props.status = CompanyStatus.active();
    this.props.updatedAt = new Date();
  }

  toPrimitives(): CompanyPrimitives {
    return {
      id: this.props.id,
      name: this.props.name,
      slug: this.props.slug,
      nif: this.props.nif,
      email: this.props.email,
      phone: this.props.phone,
      status: this.props.status.value,
      timezone: this.props.timezone,
      locale: this.props.locale,
      settings: this.props.settings,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }
}

function normalize(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}
