export interface LoginAttemptService {
  recordSuccess(
    identifier: string,
  ): Promise<void>;

  recordFailure(
    identifier: string,
  ): Promise<void>;

  getFailureCount(
    identifier: string,
  ): Promise<number>;

  isLocked(
    identifier: string,
  ): Promise<boolean>;
}
