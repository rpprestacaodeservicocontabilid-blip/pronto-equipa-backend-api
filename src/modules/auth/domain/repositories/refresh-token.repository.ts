import { RefreshTokenEntity } from '../entities/refresh-token.entity';

export interface RefreshTokenRepository {
  save(token: RefreshTokenEntity): Promise<RefreshTokenEntity>;

  findByToken(token: string): Promise<RefreshTokenEntity | null>;

  findBySessionId(sessionId: string): Promise<RefreshTokenEntity[]>;

  revoke(tokenId: number): Promise<void>;

  revokeBySessionId(sessionId: string): Promise<void>;

  deleteExpired(): Promise<void>;
}
