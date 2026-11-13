import { Role } from "../enums/role.enum";

export interface RoleRepository {
  findByName(
    role: Role,
  ): Promise<Role | null>;

  findByAccountId(
    authAccountId: number,
  ): Promise<Role[]>;

  assignRole(
    authAccountId: number,
    role: Role,
  ): Promise<void>;

  removeRole(
    authAccountId: number,
    role: Role,
  ): Promise<void>;

  hasRole(
    authAccountId: number,
    role: Role,
  ): Promise<boolean>;
}