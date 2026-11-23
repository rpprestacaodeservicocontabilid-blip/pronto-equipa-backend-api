import { AuthAccountRepository } from '../../domain/repositories/auth-account.repository';
import { AuthProvider } from '../../domain/enums/auth-provider.enum';
import { UserGateway } from '../../domain/gateways/user.gateway';

import { OAuthProviderPort } from '../ports/oauth-provider.port';
import { TokenServicePort } from '../ports/token-service.port';
import { SessionManagerPort } from '../ports/session-manager.port';

export interface RoleProvider {
  getRoleNames(userId: number): Promise<string[]>;

  getPermissionNames?(userId: number): Promise<string[]>;
}

export interface LoginWithGoogleInput {
  code: string;

  ipAddress?: string | null;

  userAgent?: string | null;

  deviceId?: string | null;
}

export interface LoginWithGoogleResult {
  userId: number;

  sessionId: number;

  accessToken: string;

  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export class LoginWithGoogleUseCase {
  constructor(
    private readonly oauthProvider: OAuthProviderPort,

    private readonly authAccountRepository: AuthAccountRepository,

    private readonly userGateway: UserGateway,

    private readonly tokenService: TokenServicePort,

    private readonly sessionManager: SessionManagerPort,

    private readonly roleProvider?: RoleProvider,
  ) {}

  async execute(input: LoginWithGoogleInput): Promise<LoginWithGoogleResult> {
    const profile = await this.oauthProvider.authenticate(input.code);

    let account = await this.authAccountRepository.findByProviderAccount(
      AuthProvider.GOOGLE,
      profile.providerId,
    );

    if (!account) {
      account = await this.authAccountRepository.findByEmail(profile.email);
    }

    if (!account) {
      const user = await this.userGateway.createUser({
        name:
          profile.displayName ??
          ([profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email),
        email: profile.email,
      });

      account = await this.authAccountRepository.createOAuthAccount({
        userId: user.id,
        email: profile.email,
        provider: AuthProvider.GOOGLE,
        providerAccountId: profile.providerId,
        emailVerified: profile.emailVerified,
      });
    }

    const assignedRoles = this.roleProvider
      ? await this.roleProvider.getRoleNames(account.userId)
      : [];
    const assignedPermissions = this.roleProvider?.getPermissionNames
      ? await this.roleProvider.getPermissionNames(account.userId)
      : [];

    const session = await this.sessionManager.createSession({
      authAccountId: account.id.getValue(),
      userId: account.userId,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      deviceId: input.deviceId ?? null,
      accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const accessToken = await this.tokenService.generateAccessToken({
      userId: account.userId,
      sessionId: session.sessionId,
      roles: [...account.roles, ...assignedRoles],
      permissions: assignedPermissions,
    });
    const refreshToken = await this.sessionManager.registerRefreshToken({
      sessionId: session.sessionId,
      createToken: (tokenId) =>
        this.tokenService.generateRefreshToken({
          userId: account.userId,
          sessionId: session.sessionId,
          tokenId,
        }),
    });

    return {
      userId: account.userId,
      sessionId: session.sessionId,
      accessToken: accessToken.token,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    };
  }
}
