import { TokenServicePort } from '../ports/token-service.port';
import { SessionManagerPort } from '../ports/session-manager.port';

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface RefreshTokenResult {
  accessToken: string;

  refreshToken: string;

  accessTokenExpiresAt: Date;

  refreshTokenExpiresAt: Date;
}

export class InvalidRefreshTokenError extends Error {}

export class RefreshTokenUseCase {
  constructor(
    private readonly tokenService: TokenServicePort,

    private readonly sessionManager: SessionManagerPort,
    private readonly getRoleNames?: (userId: number) => Promise<string[]>,
    private readonly getPermissionNames?: (userId: number) => Promise<string[]>,
  ) {}

  async identifyBrowserSession(token: string) {
    const payload = await this.tokenService.verifyRefreshToken(token).catch(() => {
      throw new InvalidRefreshTokenError('Invalid or expired refresh token.');
    });
    if (!(await this.sessionManager.isRefreshTokenCurrent({ ...payload, token }))) {
      throw new InvalidRefreshTokenError('Browser session is no longer active.');
    }
    return payload;
  }

  async resumeBrowserSession(token: string) {
    const { userId, sessionId } = await this.identifyBrowserSession(token);
    const access = await this.issueAccessToken(userId, sessionId);
    return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt };
  }

  private async issueAccessToken(userId: number, sessionId: number) {
    const roles = this.getRoleNames ? await this.getRoleNames(userId) : [];
    const permissions = this.getPermissionNames ? await this.getPermissionNames(userId) : [];
    return this.tokenService.generateAccessToken({ userId, sessionId, roles, permissions });
  }

  async execute(input: RefreshTokenInput): Promise<RefreshTokenResult> {
    const payload = await this.tokenService.verifyRefreshToken(input.refreshToken);

    const accessToken = await this.issueAccessToken(payload.userId, payload.sessionId);
    const refreshToken = await this.sessionManager.rotateRefreshToken({
      sessionId: payload.sessionId,
      tokenId: payload.tokenId,
      token: input.refreshToken,
      createNextToken: (tokenId) =>
        this.tokenService.generateRefreshToken({
          userId: payload.userId,
          sessionId: payload.sessionId,
          tokenId,
        }),
    });
    if (!refreshToken)
      throw new Error('Refresh token has already been used or the session is inactive.');

    return {
      accessToken: accessToken.token,
      refreshToken: refreshToken.token,
      accessTokenExpiresAt: accessToken.expiresAt,
      refreshTokenExpiresAt: refreshToken.expiresAt,
    };
  }
}
