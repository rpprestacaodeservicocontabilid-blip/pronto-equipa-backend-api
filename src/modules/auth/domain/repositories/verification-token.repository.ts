import { VerificationToken } from "../entities/verification-token.entity";
import { TokenType } from "../enums/token-type.enum";

export interface CreateOtpInput {
  authAccountId: number;
  codeHash: string;
  channel: string;
  destination: string;
  expiresAt: Date;
  type?: TokenType;
}

export interface VerificationTokenRepository {
  save(
    token: VerificationToken,
  ): Promise<VerificationToken>;

  create(
    data: {
      authAccountId: number;
      type: string;
    },
  ): Promise<{ value: string }>;

  createOtp(
    data: CreateOtpInput,
  ): Promise<{ id: number }>;

  findById(
    id: number,
  ): Promise<VerificationToken | null>;

  findByToken(
    token: string,
  ): Promise<VerificationToken | null>;

  findLatestActive(
    authAccountId: number,
    type: TokenType,
  ): Promise<VerificationToken | null>;

  findByAccount(
    authAccountId: number,
    type: TokenType,
  ): Promise<VerificationToken[]>;

  markAsUsed(
    id: number,
    usedAt: Date,
  ): Promise<void>;

  incrementAttempts(
    id: number,
  ): Promise<void>;

  invalidateActive(
    authAccountId: number,
    type: TokenType,
    usedAt: Date,
  ): Promise<void>;

  delete(
    id: number,
  ): Promise<void>;

  deleteExpired(): Promise<void>;
}
