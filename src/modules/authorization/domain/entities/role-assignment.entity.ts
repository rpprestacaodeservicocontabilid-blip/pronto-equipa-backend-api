import { AuthorizationScope } from '../value-objects/authorization-scope.vo';

export class RoleAssignmentEntity {
  constructor(
    readonly userId: number,
    readonly roleId: number,
    readonly scope: AuthorizationScope,
    readonly assignedBy: number,
  ) {
    if (
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      !Number.isSafeInteger(roleId) ||
      roleId <= 0 ||
      !Number.isSafeInteger(assignedBy) ||
      assignedBy <= 0
    ) {
      throw new Error('Valid user, role, and assignor IDs are required.');
    }

    if (userId === assignedBy) {
      throw new Error('Users cannot assign roles to themselves.');
    }
  }
}
