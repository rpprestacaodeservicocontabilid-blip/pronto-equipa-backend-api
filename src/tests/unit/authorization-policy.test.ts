import {
  AuthorizationPolicyInput,
  AuthorizationPolicyService,
} from '../../modules/authorization/domain/services/authorization-policy.service';
import { AuthorizationScope } from '../../modules/authorization/domain/value-objects/authorization-scope.vo';
import { PermissionCode } from '../../modules/authorization/domain/value-objects/permission-code.vo';
import { RoleEntity } from '../../modules/authorization/domain/entities/role.entity';
import { RoleAssignmentEntity } from '../../modules/authorization/domain/entities/role-assignment.entity';

describe('Authorization domain policy', () => {
  const policy = new AuthorizationPolicyService();
  const tenantScope = AuthorizationScope.tenant(12);

  const baseRequest: AuthorizationPolicyInput = {
    principalId: 7,
    scope: tenantScope,
    permission: 'payroll.approve',
    effectivePermissions: [{ code: 'payroll.approve', scope: 'tenant' }],
    membership: { tenantId: 12, active: true },
  };

  it('validates permission codes and extracts their resource and operation', () => {
    const code = PermissionCode.create('Payroll.approve');

    expect(code.value).toBe('payroll.approve');
    expect(code.resource).toBe('payroll');
    expect(code.operation).toBe('approve');
    expect(() => PermissionCode.create('payroll')).toThrow('Invalid permission code.');
  });

  it('denies missing or cross-tenant membership and resources', () => {
    expect(
      policy.authorize({
        ...baseRequest,
        membership: { tenantId: 13, active: true },
      }),
    ).toBe(false);
    expect(
      policy.authorize({
        ...baseRequest,
        resource: { tenantId: 13 },
      }),
    ).toBe(false);
  });

  it('denies by default when the role does not grant the requested permission', () => {
    expect(
      policy.authorize({
        ...baseRequest,
        effectivePermissions: [{ code: 'payroll.read', scope: 'tenant' }],
      }),
    ).toBe(false);
  });

  it('prevents a preparer from approving when separation of duties applies', () => {
    expect(
      policy.authorize({
        ...baseRequest,
        resource: {
          preparedById: 7,
          requiresSeparationOfDuties: true,
        },
      }),
    ).toBe(false);
    expect(
      policy.authorize({
        ...baseRequest,
        resource: {
          preparedById: 8,
          requiresSeparationOfDuties: true,
        },
      }),
    ).toBe(true);

    expect(
      policy.authorize({
        ...baseRequest,
        resource: { requiresSeparationOfDuties: true },
      }),
    ).toBe(false);
  });

  it('does not grant payroll access from the platform context', () => {
    expect(
      policy.authorize({
        ...baseRequest,
        scope: AuthorizationScope.platform(),
        effectivePermissions: [{ code: 'payroll.approve', scope: 'platform' }],
        resource: { sensitivity: 'payroll' },
      }),
    ).toBe(false);
  });

  it('does not reuse a tenant grant in the platform context', () => {
    expect(
      policy.authorize({
        ...baseRequest,
        scope: AuthorizationScope.platform(),
      }),
    ).toBe(false);
  });

  it('evaluates explicit ABAC conditions and denies missing attributes', () => {
    expect(
      policy.authorize({
        ...baseRequest,
        principalAttributes: { department: 'HR' },
        conditions: [
          {
            source: 'principal',
            attribute: 'department',
            equals: 'HR',
          },
        ],
      }),
    ).toBe(true);
    expect(
      policy.authorize({
        ...baseRequest,
        conditions: [
          {
            source: 'principal',
            attribute: 'department',
            equals: 'HR',
          },
        ],
      }),
    ).toBe(false);
  });

  it('protects system roles from deactivation', () => {
    const systemRole = RoleEntity.create({
      name: 'SUPPORT',
      scope: AuthorizationScope.platform(),
      isSystem: true,
    });

    expect(() => systemRole.deactivate()).toThrow('System roles cannot be deactivated.');
  });

  it('prevents self-assignment of roles', () => {
    expect(() => new RoleAssignmentEntity(7, 3, tenantScope, 7)).toThrow(
      'Users cannot assign roles to themselves.',
    );
  });
});
