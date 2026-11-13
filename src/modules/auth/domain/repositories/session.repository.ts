import { Session } from "../entities/session.entity";

export interface SessionRepository {
  save(
    session: Session,
  ): Promise<Session>;

  findById(
    id: string,
  ): Promise<Session | null>;

  findByAuthAccountId(
    authAccountId: number,
  ): Promise<Session[]>;

  findActiveByAuthAccountId(
    authAccountId: number,
  ): Promise<Session[]>;

  revoke(
    id: string,
  ): Promise<void>;

  revokeAllByAuthAccountId(
    authAccountId: number,
  ): Promise<void>;

  deleteExpired(): Promise<void>;
}