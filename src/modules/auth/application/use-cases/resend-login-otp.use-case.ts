import { AuthAccountRepository } from '../../domain/repositories/auth-account.repository';
import { VerificationTokenRepository } from '../../domain/repositories/verification-token.repository';
import { TokenType } from '../../domain/enums/token-type.enum';

import { EmailServicePort } from '../ports/email-service.port';
import { SmsServicePort } from '../ports/sms-service.port';
import { OtpServicePort } from '../ports/otp-service.port';

import { authError } from '../errors/auth-application-error';

import { maskDestination } from '../utils/mask-destination';

import {
  LOGIN_OTP_RESEND_COOLDOWN_SECONDS,
  LOGIN_OTP_TTL_MINUTES,
  LoginChannel,
  StartLoginResult,
} from './start-login.use-case';

export interface ResendLoginOtpInput {
  challengeId: number;
}

export class ResendLoginOtpUseCase {
  constructor(
    private readonly authAccountRepository: AuthAccountRepository,

    private readonly verificationTokenRepository: VerificationTokenRepository,

    private readonly emailService: EmailServicePort,

    private readonly smsService: SmsServicePort,

    private readonly otpService: OtpServicePort,
  ) {}

  async execute(input: ResendLoginOtpInput): Promise<StartLoginResult> {
    if (!Number.isInteger(input.challengeId) || input.challengeId <= 0) {
      throw authError('Invalid login challenge.', 400);
    }

    const challenge = await this.verificationTokenRepository.findById(input.challengeId);

    if (!challenge || challenge.type !== TokenType.LOGIN_OTP || !challenge.isValid()) {
      throw authError('Invalid or expired login challenge.', 401);
    }

    const elapsedMs = Date.now() - challenge.createdAt.getTime();

    const cooldownMs = LOGIN_OTP_RESEND_COOLDOWN_SECONDS * 1000;

    if (elapsedMs < cooldownMs) {
      const retryAfterSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);

      const error = authError('Please wait before requesting a new code.', 429) as Error & {
        retryAfterSeconds?: number;
      };

      error.retryAfterSeconds = retryAfterSeconds;

      throw error;
    }

    const account = await this.authAccountRepository.findById(challenge.authAccountId);

    if (!account) {
      throw authError('Authentication account not found.', 401);
    }

    const channel: LoginChannel = challenge.channel === 'sms' ? 'sms' : 'email';

    const destination = challenge.destination ?? account.email.getValue();

    const now = new Date();

    // Invalida o desafio atual antes de criar o novo.
    await this.verificationTokenRepository.invalidateActive(
      account.id.getValue(),
      TokenType.LOGIN_OTP,
      now,
    );

    const code = this.otpService.generateCode();

    const expiresAt = new Date(now.getTime() + LOGIN_OTP_TTL_MINUTES * 60 * 1000);

    const newChallenge = await this.verificationTokenRepository.createOtp({
      authAccountId: account.id.getValue(),
      codeHash: this.otpService.hash(code),
      channel,
      destination,
      expiresAt,
    });

    if (channel === 'email') {
      await this.emailService.send({
        to: destination,
        subject: 'O seu código de acesso',
        template: 'login-otp',
        variables: {
          code,
          expiresInMinutes: LOGIN_OTP_TTL_MINUTES,
        },
      });
    } else {
      await this.smsService.send({
        phoneNumber: destination,
        message:
          `Peladeiro: o seu código de acesso é ${code}. ` +
          `Válido por ${LOGIN_OTP_TTL_MINUTES} minutos.`,
      });
    }

    const result: StartLoginResult = {
      otpRequired: true,
      challengeId: newChallenge.id,
      channel,
      destination: maskDestination(channel, destination),
      expiresAt,
    };

    if (process.env.NODE_ENV !== 'production') {
      result.developmentCode = code;
    }

    return result;
  }
}
