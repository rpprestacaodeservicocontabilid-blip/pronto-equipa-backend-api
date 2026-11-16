import { LoginAttemptService } from '../../domain/services/login-attempt.service';

/**
 * Tracks login attempts for security purposes
 * Records failed login attempts to prevent brute force attacks
 */
export class LoginAttemptServiceImpl implements LoginAttemptService {
  private failedAttempts = new Map<
    string,
    {
      count: number;
      lastAttempt: Date;
    }
  >();

  /**
   * Records a successful login - clears failed attempts
   */
  async recordSuccess(identifier: string): Promise<void> {
    this.failedAttempts.delete(identifier);
  }

  /**
   * Records a failed login attempt
   */
  async recordFailure(identifier: string): Promise<void> {
    const record = this.failedAttempts.get(identifier);

    if (record) {
      record.count += 1;
      record.lastAttempt = new Date();
    } else {
      this.failedAttempts.set(identifier, {
        count: 1,
        lastAttempt: new Date(),
      });
    }

    // TODO: Implement persistence (Redis/Database)
    // TODO: Implement notification on threshold
  }

  /**
   * Gets the number of failed login attempts
   */
  async getFailureCount(identifier: string): Promise<number> {
    const record = this.failedAttempts.get(identifier);
    return record?.count || 0;
  }

  /**
   * Checks if an identifier is locked due to too many failures
   */
  async isLocked(identifier: string): Promise<boolean> {
    const record = this.failedAttempts.get(identifier);
    if (!record) {
      return false;
    }

    // Lock if more than 5 failures
    if (record.count >= 5) {
      return true;
    }

    return false;
  }
}
