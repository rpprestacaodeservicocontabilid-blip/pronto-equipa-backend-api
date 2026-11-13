export interface AccessTokenPayload {
  userId: number;
  sessionId: number;
  roles: string[];
  permissions: string[];
}

export interface RefreshTokenPayload {
  userId: number;
  sessionId: number;
  tokenId: number;
}

export interface GeneratedTokens {
  accessToken: string;
  refreshToken: string;

  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export interface TokenServicePort {
  generateAccessToken(
    payload: AccessTokenPayload,
  ): Promise<{
    token: string;
    expiresAt: Date;
  }>;

  generateRefreshToken(
    payload: RefreshTokenPayload,
  ): Promise<{
    token: string;
    expiresAt: Date;
  }>;

  verifyAccessToken(
    token: string,
  ): Promise<AccessTokenPayload>;

  verifyRefreshToken(
    token: string,
  ): Promise<RefreshTokenPayload>;
}