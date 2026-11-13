import { PermissionCode } from '../value-objects/permission-code.vo';

export class RolePermissionEntity {
  readonly roleId: number;
  readonly permission: PermissionCode;

  constructor(roleId: number, permission: string) {
    if (!Number.isSafeInteger(roleId) || roleId <= 0) {
      throw new Error('A valid role ID is required.');
    }

    this.roleId = roleId;
    this.permission = PermissionCode.create(permission);
  }
}
