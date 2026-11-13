import { PasswordResetToken } from "../entities/password-reset-token.entity";

export interface PasswordResetRepository {
  save(
    token: PasswordResetToken,
  ): Promise<PasswordResetToken>;

  create(
    data: {
      authAccountId: number;
    },
  ): Promise<{ value: string }>;

  findByToken(
    token: string,
  ): Promise<PasswordResetToken | null>;

  findByAccount(
    authAccountId: number,
  ): Promise<PasswordResetToken[]>;

  delete(
    id: number,
  ): Promise<void>;

  deleteExpired(): Promise<void>;
}