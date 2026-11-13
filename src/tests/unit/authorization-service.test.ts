import { AuthorizationService } from '../../modules/authorization/application/services/authorization.service';
import { PlatformPermissionCheckerPort } from '../../modules/authorization/application/ports/platform-permission-checker.port';
import { TenantPermissionCheckerPort } from '../../modules/authorization/application/ports/tenant-permission-checker.port';
import { MembershipReaderPort } from '../../modules/tenancy/application/ports/membership-reader.port';

describe('AuthorizationService', () => {
  const membershipReader: jest.Mocked<MembershipReaderPort> = {
    findMembership: jest.fn(),
    findPermissionNames: jest.fn(),
    findActiveCompanyIds: jest.fn(),
  };
  const tenantPermissionChecker: jest.Mocked<TenantPermissionCheckerPort> = {
    hasPermission: jest.fn(),
  };
  const platformPermissionChecker: jest.Mocked<PlatformPermissionCheckerPort> = {
    hasPermission: jest.fn(),
  };

  const service = new AuthorizationService(
    membershipReader,
    tenantPermissionChecker,
    platformPermissionChecker,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires an active membership before checking tenant permissions', async () => {
    membershipReader.findMembership.mockResolvedValue(null);

    await expect(
      service.authorize({
        principalId: 5,
        context: { type: 'tenant', tenantId: 8 },
        permission: 'company.read',
      }),
    ).resolves.toBe(false);

    expect(tenantPermissionChecker.hasPermission).not.toHaveBeenCalled();
  });

  it('checks effective permission and resource tenant together', async () => {
    membershipReader.findMembership.mockResolvedValue({
      companyId: 8,
      userId: 5,
      roleId: 2,
      memberStatus: 'ACTIVE',
      companyStatus: 'ACTIVE',
    });
    tenantPermissionChecker.hasPermission.mockResolvedValue(true);

    await expect(
      service.authorize({
        principalId: 5,
        context: { type: 'tenant', tenantId: 8 },
        permission: 'company.read',
        resource: { tenantId: 9 },
      }),
    ).resolves.toBe(false);
  });

  it('checks platform grants without reusing tenant permission grants', async () => {
    platformPermissionChecker.hasPermission.mockResolvedValue(true);

    await expect(
      service.authorize({
        principalId: 5,
        context: { type: 'platform' },
        permission: 'platform.companies.read',
      }),
    ).resolves.toBe(true);

    expect(tenantPermissionChecker.hasPermission).not.toHaveBeenCalled();
    expect(platformPermissionChecker.hasPermission).toHaveBeenCalledWith(
      5,
      'platform.companies.read',
    );
  });
});
