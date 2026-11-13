import { AuthorizationScope } from '../value-objects/authorization-scope.vo';
import { PermissionCode } from '../value-objects/permission-code.vo';

export class PermissionEntity {
  readonly code: PermissionCode;
  readonly description: string | null;
  readonly scope: AuthorizationScope;

  constructor(input: { code: string; description?: string | null; scope: AuthorizationScope }) {
    this.code = PermissionCode.create(input.code);
    this.description = input.description?.trim() || null;
    this.scope = input.scope;
  }
}
