import { AuthAccountRepository } from "../../domain/repositories/auth-account.repository";
import { VerificationTokenRepository } from "../../domain/repositories/verification-token.repository";

import { EmailServicePort } from "../ports/email-service.port";
import { OtpServicePort } from "../ports/otp-service.port";
import { TokenType } from "../../domain/enums/token-type.enum";
import { authError } from "../errors/auth-application-error";

export interface ResendEmailVerificationInput {
    userId?: number;
    email?: string;
}

export class ResendEmailVerificationUseCase {
    constructor(
        private readonly authAccountRepository: AuthAccountRepository,

        private readonly verificationTokenRepository: VerificationTokenRepository,

        private readonly emailService: EmailServicePort,
        private readonly otpService?: OtpServicePort,
    ) { }

    async execute(
        input: ResendEmailVerificationInput,
    ): Promise<{ success: true; challengeId?: number; developmentCode?: string } | void> {
        const account = input.userId
            ? await this.authAccountRepository.findByUserId(input.userId)
            : input.email
                ? await this.authAccountRepository.findByEmail(input.email)
                : null;

        if (!account) {
            // Uniform response avoids revealing whether an email is registered.
            return { success: true };
        }

        if (account.emailVerifiedAt) {
            return { success: true };
        }

        const destination =
            account.email.getValue();

        if (this.otpService) {
            const now = new Date();
            const active = await this.verificationTokenRepository.findLatestActive(account.id.getValue(), TokenType.EMAIL_VERIFICATION_OTP);
            if (active && now.getTime() - active.createdAt.getTime() < 60_000) {
                throw authError("Please wait before requesting another code.", 429);
            }
            await this.verificationTokenRepository.invalidateActive(account.id.getValue(), TokenType.EMAIL_VERIFICATION_OTP, now);
            const code = this.otpService.generateCode();
            const challenge = await this.verificationTokenRepository.createOtp({
                authAccountId: account.id.getValue(),
                codeHash: this.otpService.hash(code),
                channel: "email",
                destination,
                expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
                type: TokenType.EMAIL_VERIFICATION_OTP,
            });
            await this.emailService.send({
                to: destination,
                subject: "Verify your email",
                template: "email-verification-otp",
                variables: { code, expiresAt: new Date(now.getTime() + 10 * 60 * 1000) },
            });
            return { success: true, challengeId: challenge.id, ...(process.env.NODE_ENV !== "production" ? { developmentCode: code } : {}) };
        }
        const token =
            await this.verificationTokenRepository.create({
                authAccountId: account.id.getValue(),
                type: "EMAIL_VERIFICATION",
            });

        await this.emailService.send({
            to: destination,
            subject: "Verify your email",
            template: "email-verification",
            variables: {
                token: token.value,
            },
        });
    }
}
