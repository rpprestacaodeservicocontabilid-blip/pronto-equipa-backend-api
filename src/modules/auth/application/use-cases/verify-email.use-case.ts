import { VerificationTokenRepository } from '../../domain/repositories/verification-token.repository';
import { AuthAccountRepository } from '../../domain/repositories/auth-account.repository';

import { AuditServicePort } from '../ports/audit-service.port';
import { OtpServicePort } from '../ports/otp-service.port';
import { TokenType } from '../../domain/enums/token-type.enum';

export interface VerifyEmailInput {
  token?: string;
  challengeId?: number;
  code?: string;
}

export class VerifyEmailUseCase {
  constructor(
    private readonly verificationTokenRepository: VerificationTokenRepository,

    private readonly authAccountRepository: AuthAccountRepository,

    private readonly auditService: AuditServicePort,
    private readonly otpService?: OtpServicePort,
  ) {}

  async execute(input: VerifyEmailInput): Promise<void> {
    let verificationToken;
    if (input.challengeId && input.code && this.otpService) {
      if (!/^\d{6}$/.test(input.code.trim()))
        throw new Error('A 6-digit verification code is required.');
      verificationToken = await this.verificationTokenRepository.findById(input.challengeId);
      if (
        !verificationToken ||
        verificationToken.type !== TokenType.EMAIL_VERIFICATION_OTP ||
        !verificationToken.isValid()
      ) {
        throw new Error('Invalid or expired verification challenge.');
      }
      if (verificationToken.hasReachedMaxAttempts(5)) {
        verificationToken.invalidate();
        await this.verificationTokenRepository.save(verificationToken);
        throw new Error('Too many verification attempts. Request a new code.');
      }
      if (!this.otpService.matches(input.code.trim(), verificationToken.token)) {
        verificationToken.registerAttempt();
        if (verificationToken.hasReachedMaxAttempts(5)) verificationToken.invalidate();
        await this.verificationTokenRepository.save(verificationToken);
        throw new Error('Invalid verification code.');
      }
    } else if (input.token) {
      verificationToken = await this.verificationTokenRepository.findByToken(input.token);
    } else {
      throw new Error('Verification challenge and code are required.');
    }

    if (!verificationToken) {
      throw new Error('Invalid verification token.');
    }

    if (verificationToken.isExpired()) {
      throw new Error('Verification token has expired.');
    }

    if (verificationToken.isUsed()) {
      throw new Error('Verification token has already been used.');
    }

    const account = await this.authAccountRepository.findById(verificationToken.authAccountId);

    if (!account) {
      throw new Error('Authentication account not found.');
    }

    account.verifyEmail();

    await this.authAccountRepository.save(account);

    verificationToken.use();

    await this.verificationTokenRepository.save(verificationToken);

    await this.auditService.record({
      userId: account.userId,
      action: 'EMAIL_VERIFIED',
      resource: 'auth-account',
      resourceId: String(account.id),
      ipAddress: null,
      userAgent: null,
    });
  }
}
