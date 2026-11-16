import { Session } from '../entities/session.entity';

export interface SessionService {
  createSession(input: CreateSessionInput): Session;

  isSessionActive(session: Session): boolean;

  revokeSession(session: Session): void;
}

export interface CreateSessionInput {
  id: string;

  authAccountId: number;

  userId: number;

  ipAddress?: string | null;

  userAgent?: string | null;

  deviceId?: string | null;

  expiresAt: Date;
}
