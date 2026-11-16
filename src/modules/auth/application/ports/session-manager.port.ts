export interface CreateSessionInput {
  authAccountId: number;

  userId: number;

  ipAddress: string | null;

  userAgent: string | null;

  deviceId: string | null;

  accessTokenExpiresAt: Date;

  refreshTokenExpiresAt: Date;
}

export interface SessionResult {
  sessionId: number;

  userId: number;

  authAccountId: number;

  status: string;

  createdAt: Date;

  expiresAt: Date;

  refreshTokenId?: number | null;
}

export interface SessionManagerPort {
  createSession(input: CreateSessionInput): Promise<SessionResult>;

  getSession(sessionId: number): Promise<SessionResult | null>;

  revokeSession(sessionId: number): Promise<void>;

  revokeAllSessions(userId: number, exceptSessionId?: number): Promise<void>;

  isSessionActive(sessionId: number): Promise<boolean>;

  registerRefreshToken(input: {
    sessionId: number;
    createToken: (tokenId: number) => Promise<{ token: string; expiresAt: Date }>;
  }): Promise<{ token: string; expiresAt: Date }>;

  rotateRefreshToken(input: {
    sessionId: number;
    tokenId: number;
    token: string;
    createNextToken: (tokenId: number) => Promise<{ token: string; expiresAt: Date }>;
  }): Promise<{ token: string; expiresAt: Date } | null>;
}
