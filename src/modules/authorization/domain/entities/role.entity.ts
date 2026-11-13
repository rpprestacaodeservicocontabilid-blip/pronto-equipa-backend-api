import { AuthorizationScope } from '../value-objects/authorization-scope.vo';

export interface CreateRoleInput {
  id?: number;
  name: string;
  description?: string | null;
  scope: AuthorizationScope;
  isSystem?: boolean;
}

export class RoleEntity {
  readonly id?: number;
  name: string;
  description: string | null;
  readonly scope: AuthorizationScope;
  readonly isSystem: boolean;
  private active = true;

  private constructor(input: CreateRoleInput) {
    const name = input.name.trim();

    if (!name || name.length > 100) {
      throw new Error('Role name must contain 1 to 100 characters.');
    }

    if (input.id !== undefined && (!Number.isSafeInteger(input.id) || input.id <= 0)) {
      throw new Error('A valid role ID is required.');
    }

    this.id = input.id;
    this.name = name;
    this.description = input.description?.trim() || null;
    this.scope = input.scope;
    this.isSystem = input.isSystem ?? false;
  }

  static create(input: CreateRoleInput): RoleEntity {
    return new RoleEntity(input);
  }

  get isActive(): boolean {
    return this.active;
  }

  updateDetails(name: string, description?: string | null): void {
    if (!this.active) {
      throw new Error('Inactive roles cannot be modified.');
    }

    if (this.isSystem) {
      throw new Error('System roles cannot be modified.');
    }

    this.name = this.validateName(name);
    this.description = description?.trim() || null;
  }

  deactivate(): void {
    if (this.isSystem) {
      throw new Error('System roles cannot be deactivated.');
    }

    this.active = false;
  }

  private validateName(name: string): string {
    const normalized = name.trim();

    if (!normalized || normalized.length > 100) {
      throw new Error('Role name must contain 1 to 100 characters.');
    }

    return normalized;
  }
}
