import { Op } from 'sequelize';
import { SessionManagerPort, SessionResult } from '../../application/ports/session-manager.port';
import { SessionModel } from '../persistence/models/session.model';
import { AuthAccountModel } from '../persistence/models/auth-account.model';
import { RefreshTokenModel } from '../persistence/models/refresh-token.model';
import { createHash, randomUUID } from 'crypto';
import { sequelize } from '../../../../infra/database';

/** Persists and validates sessions against the auth_sessions table. */
export class SessionManagerService implements SessionManagerPort {
  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private pendingTokenHash(): string {
    return this.hashRefreshToken(`pending:${randomUUID()}`);
  }

  async registerRefreshToken(input: {
    sessionId: number;
    createToken: (tokenId: number) => Promise<{ token: string; expiresAt: Date }>;
  }): Promise<{ token: string; expiresAt: Date }> {
    return sequelize.transaction(async (transaction) => {
      const session = await SessionModel.findByPk(input.sessionId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!session || session.status !== 'ACTIVE') throw new Error('Active session not found.');

      const tokenRecord = await RefreshTokenModel.create(
        {
          authAccountId: session.authAccountId,
          sessionId: session.id,
          tokenHash: this.pendingTokenHash(),
          expiresAt: session.expiresAt,
          revokedAt: null,
          replacedByTokenId: null,
          createdAt: new Date(),
        },
        { transaction },
      );
      const generated = await input.createToken(tokenRecord.id);

      await tokenRecord.update(
        {
          tokenHash: this.hashRefreshToken(generated.token),
          expiresAt: generated.expiresAt,
        },
        { transaction },
      );
      await session.update(
        {
          refreshTokenId: tokenRecord.id,
          expiresAt: generated.expiresAt,
        },
        { transaction },
      );

      return generated;
    });
  }

  async isRefreshTokenCurrent(input: {
    userId: number;
    sessionId: number;
    tokenId: number;
    token: string;
  }): Promise<boolean> {
    const now = new Date();
    const session = await SessionModel.findOne({
      where: {
        id: input.sessionId,
        status: 'ACTIVE',
        refreshTokenId: input.tokenId,
        expiresAt: { [Op.gt]: now },
      },
    });
    if (!session) return false;
    const [account, refreshToken] = await Promise.all([
      AuthAccountModel.findOne({ where: { id: session.authAccountId, userId: input.userId, status: 'ACTIVE' } }),
      RefreshTokenModel.findOne({ where: {
        id: input.tokenId,
        sessionId: session.id,
        authAccountId: session.authAccountId,
        tokenHash: this.hashRefreshToken(input.token),
        revokedAt: null,
        expiresAt: { [Op.gt]: now },
      } }),
    ]);
    return Boolean(account && refreshToken);
  }

  async rotateRefreshToken(input: {
    sessionId: number;
    tokenId: number;
    token: string;
    createNextToken: (tokenId: number) => Promise<{ token: string; expiresAt: Date }>;
  }): Promise<{ token: string; expiresAt: Date } | null> {
    return sequelize.transaction(async (transaction) => {
      const now = new Date();
      const session = await SessionModel.findByPk(input.sessionId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (
        !session ||
        session.status !== 'ACTIVE' ||
        session.expiresAt <= now ||
        session.refreshTokenId !== input.tokenId
      )
        return null;

      const currentToken = await RefreshTokenModel.findOne({
        where: {
          id: input.tokenId,
          sessionId: input.sessionId,
          authAccountId: session.authAccountId,
          tokenHash: this.hashRefreshToken(input.token),
          revokedAt: null,
          expiresAt: { [Op.gt]: now },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!currentToken) return null;

      const nextTokenRecord = await RefreshTokenModel.create(
        {
          authAccountId: session.authAccountId,
          sessionId: session.id,
          tokenHash: this.pendingTokenHash(),
          expiresAt: session.expiresAt,
          revokedAt: null,
          replacedByTokenId: null,
          createdAt: now,
        },
        { transaction },
      );
      const generated = await input.createNextToken(nextTokenRecord.id);

      await nextTokenRecord.update(
        {
          tokenHash: this.hashRefreshToken(generated.token),
          expiresAt: generated.expiresAt,
        },
        { transaction },
      );
      await currentToken.update(
        {
          revokedAt: now,
          replacedByTokenId: nextTokenRecord.id,
        },
        { transaction },
      );
      await session.update(
        {
          refreshTokenId: nextTokenRecord.id,
          expiresAt: generated.expiresAt,
        },
        { transaction },
      );

      return generated;
    });
  }
  async createSession(input: {
    authAccountId: number;
    userId: number;
    ipAddress: string | null;
    userAgent: string | null;
    deviceId: string | null;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
  }): Promise<SessionResult> {
    const now = new Date();
    const model = await SessionModel.create({
      authAccountId: input.authAccountId,
      refreshTokenId: null,
      status: 'ACTIVE',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      deviceId: input.deviceId,
      expiresAt: input.refreshTokenExpiresAt,
      lastActivityAt: now,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      sessionId: model.id,
      userId: input.userId,
      authAccountId: model.authAccountId,
      status: model.status,
      createdAt: model.createdAt,
      expiresAt: model.expiresAt,
    };
  }

  async getSession(sessionId: number): Promise<SessionResult | null> {
    const model = await SessionModel.findByPk(sessionId);
    if (!model) return null;

    const account = await AuthAccountModel.findByPk(model.authAccountId);
    if (!account) return null;

    return {
      sessionId: model.id,
      userId: account.userId,
      authAccountId: account.id,
      status: model.status,
      createdAt: model.createdAt,
      expiresAt: model.expiresAt,
    };
  }

  async revokeSession(sessionId: number): Promise<void> {
    await SessionModel.update(
      { status: 'REVOKED', revokedAt: new Date() },
      { where: { id: sessionId, status: 'ACTIVE' } },
    );
  }

  async revokeAllSessions(userId: number, exceptSessionId?: number): Promise<void> {
    const account = await AuthAccountModel.findOne({ where: { userId } });
    if (!account) return;

    await SessionModel.update(
      { status: 'REVOKED', revokedAt: new Date() },
      {
        where: {
          authAccountId: account.id,
          status: 'ACTIVE',
          ...(exceptSessionId ? { id: { [Op.ne]: exceptSessionId } } : {}),
        },
      },
    );
  }

  async isSessionActive(sessionId: number): Promise<boolean> {
    const model = await SessionModel.findByPk(sessionId);
    return Boolean(model && model.status === 'ACTIVE' && model.expiresAt > new Date());
  }
}
