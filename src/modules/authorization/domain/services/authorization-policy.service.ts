import { AuthorizationScope } from '../value-objects/authorization-scope.vo';
import { PermissionCode } from '../value-objects/permission-code.vo';

type AttributeSource = 'principal' | 'context' | 'resource';

export interface AttributeCondition {
  source: AttributeSource;
  attribute: string;
  equals: string | number | boolean | null;
}

export interface AuthorizationPolicyInput {
  principalId: number;
  scope: AuthorizationScope;
  permission: string;
  effectivePermissions: readonly {
    code: string;
    scope: 'tenant' | 'platform';
  }[];
  membership?: {
    tenantId: number;
    active: boolean;
  };
  principalAttributes?: Readonly<Record<string, unknown>>;
  contextAttributes?: Readonly<Record<string, unknown>>;
  resource?: {
    tenantId?: number;
    type?: string;
    sensitivity?: 'standard' | 'payroll';
    preparedById?: number;
    requiresSeparationOfDuties?: boolean;
    attributes?: Readonly<Record<string, unknown>>;
  };
  conditions?: readonly AttributeCondition[];
}

/**
 * RBAC grants are necessary but not sufficient: tenant membership and
 * resource constraints are evaluated on every decision. Missing facts deny.
 */
export class AuthorizationPolicyService {
  authorize(input: AuthorizationPolicyInput): boolean {
    if (!Number.isSafeInteger(input.principalId) || input.principalId <= 0) {
      return false;
    }

    const permission = PermissionCode.create(input.permission);
    const grants = input.effectivePermissions.map((grant) => ({
      code: PermissionCode.create(grant.code).value,
      scope: grant.scope,
    }));

    if (
      !grants.some(
        (grant) => grant.code === permission.value && grant.scope === input.scope.context.type,
      )
    ) {
      return false;
    }

    const { context } = input.scope;

    if (context.type === 'tenant') {
      if (!input.membership?.active || input.membership.tenantId !== context.tenantId) {
        return false;
      }

      if (input.resource?.tenantId !== undefined && input.resource.tenantId !== context.tenantId) {
        return false;
      }
    } else if (
      input.resource?.sensitivity === 'payroll' ||
      input.resource?.type === 'payroll' ||
      permission.value.startsWith('payroll.')
    ) {
      return false;
    }

    if (
      input.resource?.requiresSeparationOfDuties &&
      permission.operation === 'approve' &&
      (!Number.isSafeInteger(input.resource.preparedById) ||
        input.resource.preparedById === input.principalId)
    ) {
      return false;
    }

    return (input.conditions ?? []).every((condition) => {
      const attributes = this.attributesFor(input, condition.source);

      return (
        Object.prototype.hasOwnProperty.call(attributes, condition.attribute) &&
        attributes[condition.attribute] === condition.equals
      );
    });
  }

  private attributesFor(
    input: AuthorizationPolicyInput,
    source: AttributeSource,
  ): Readonly<Record<string, unknown>> {
    switch (source) {
      case 'principal':
        return input.principalAttributes ?? {};
      case 'context':
        return input.contextAttributes ?? {};
      case 'resource':
        return input.resource?.attributes ?? {};
    }
  }
}
