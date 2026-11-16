import { Permission } from '../enums/permission.enum';
import { Role } from '../enums/role.enum';

export interface PermissionRepository {
  findByRole(role: Role): Promise<Permission[]>;

  findByAccountId(authAccountId: number): Promise<Permission[]>;

  hasPermission(authAccountId: number, permission: Permission): Promise<boolean>;

  assignPermissionToRole(role: Role, permission: Permission): Promise<void>;

  removePermissionFromRole(role: Role, permission: Permission): Promise<void>;
}
