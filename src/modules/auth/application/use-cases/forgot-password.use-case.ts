import { AuthAccountRepository } from "../../domain/repositories/auth-account.repository";
import { PasswordResetRepository } from "../../domain/repositories/password-reset.repository";

import { EmailServicePort } from "../ports/email-service.port";

export interface ForgotPasswordInput {
    email: string;
}

export class ForgotPasswordUseCase {
    constructor(
        private readonly authAccountRepository: AuthAccountRepository,

        private readonly passwordResetRepository: PasswordResetRepository,

        private readonly emailService: EmailServicePort,
    ) { }

    async execute(
        input: ForgotPasswordInput,
    ): Promise<{ developmentToken?: string }> {
        const account =
            await this.authAccountRepository.findByEmail(
                input.email,
            );

        // Não revelar se o email existe.
        if (!account) {
            return {};
        }

        const resetToken =
            await this.passwordResetRepository.create({
                authAccountId: account.id.getValue(),
            });

        await this.emailService.send({
            to: account.email.getValue(),
            subject: "Password reset",
            template: "password-reset",
            variables: {
                token: resetToken.value,
            },
        });

        // The current EmailService is a no-op. Expose the token only in
        // non-production environments so the reset flow can be exercised
        // locally without weakening the production response.
        if (process.env.NODE_ENV !== "production") {
            return { developmentToken: resetToken.value };
        }

        return {};
    }
}
