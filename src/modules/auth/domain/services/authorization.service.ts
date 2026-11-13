import { Permission } from "../enums/permission.enum";
import { Role } from "../enums/role.enum";

export interface AuthorizationService {
  hasRole(
    roles: readonly Role[],
    role: Role,
  ): boolean;

  hasPermission(
    permissions: readonly Permission[],
    permission: Permission,
  ): boolean;

  hasAnyPermission(
    permissions: readonly Permission[],
    required: Permission[],
  ): boolean;

  hasAllPermissions(
    permissions: readonly Permission[],
    required: Permission[],
  ): boolean;
}