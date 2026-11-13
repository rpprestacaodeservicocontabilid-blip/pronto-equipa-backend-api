import { AuthAccount } from "../entities/auth-account.entity";

export interface AccountLockService {
  shouldLock(
    account: AuthAccount,
  ): boolean;

  getLockDuration(
    failedAttempts: number,
  ): number;

  lock(
    account: AuthAccount,
  ): void;

  unlock(
    account: AuthAccount,
  ): void;
}