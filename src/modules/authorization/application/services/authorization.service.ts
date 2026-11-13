import { MembershipReaderPort } from '../../../tenancy/application/ports/membership-reader.port';
import { AuthorizationPolicyService } from '../../domain/services/authorization-policy.service';
import {
  AuthorizationContext,
  AuthorizationScope,
} from '../../domain/value-objects/authorization-scope.vo';
import { PlatformPermissionCheckerPort } from '../ports/platform-permission-checker.port';
import { TenantPermissionCheckerPort } from '../ports/tenant-permission-checker.port';

export interface AuthorizeInput {
  principalId: number;
  context: AuthorizationContext;
  permission: string;
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
}

export class AuthorizationService {
  constructor(
    private readonly membershipReader: MembershipReaderPort,
    private readonly tenantPermissionChecker: TenantPermissionCheckerPort,
    private readonly platformPermissionChecker: PlatformPermissionCheckerPort,
    private readonly policy: AuthorizationPolicyService = new AuthorizationPolicyService(),
  ) {}

  async authorize(input: AuthorizeInput): Promise<boolean> {
    const scope =
      input.context.type === 'tenant'
        ? AuthorizationScope.tenant(input.context.tenantId)
        : AuthorizationScope.platform();

    let membership:
      | {
          tenantId: number;
          active: boolean;
        }
      | undefined;
    let granted = false;

    if (input.context.type === 'tenant') {
      const currentMembership = await this.membershipReader.findMembership(
        input.context.tenantId,
        input.principalId,
      );

      membership = currentMembership
        ? {
            tenantId: currentMembership.companyId,
            active:
              currentMembership.memberStatus === 'ACTIVE' &&
              currentMembership.companyStatus === 'ACTIVE',
          }
        : undefined;

      if (membership?.active) {
        granted = await this.tenantPermissionChecker.hasPermission(
          input.principalId,
          input.context.tenantId,
          input.permission,
        );
      }
    } else {
      granted = await this.platformPermissionChecker.hasPermission(
        input.principalId,
        input.permission,
      );
    }

    return this.policy.authorize({
      principalId: input.principalId,
      scope,
      permission: input.permission,
      effectivePermissions: granted ? [{ code: input.permission, scope: input.context.type }] : [],
      membership,
      principalAttributes: input.principalAttributes,
      contextAttributes: input.contextAttributes,
      resource: input.resource,
    });
  }
}
