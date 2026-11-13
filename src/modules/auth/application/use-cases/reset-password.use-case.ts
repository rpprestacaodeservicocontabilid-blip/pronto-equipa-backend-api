import { PasswordResetRepository } from "../../domain/repositories/password-reset.repository";
import { AuthAccountRepository } from "../../domain/repositories/auth-account.repository";
import { Password } from "../../domain/value-objects/password.vo";

import { PasswordHasherPort } from "../ports/password-hasher.port";

export interface ResetPasswordInput {
    token: string;

    newPassword: string;
    confirmPassword?: string;
}

export class ResetPasswordUseCase {
    constructor(
        private readonly passwordResetRepository: PasswordResetRepository,

        private readonly authAccountRepository: AuthAccountRepository,

        private readonly passwordHasher: PasswordHasherPort,
    ) { }

    async execute(
        input: ResetPasswordInput,
    ): Promise<void> {
        if (input.newPassword.length < 8) throw new Error("Password must contain at least 8 characters.");
        if (input.confirmPassword !== undefined && input.newPassword !== input.confirmPassword) throw new Error("Passwords do not match.");
        const resetToken =
            await this.passwordResetRepository.findByToken(
                input.token,
            );

        if (!resetToken) {
            throw new Error(
                "Invalid password reset token.",
            );
        }

        if (resetToken.isExpired()) {
            throw new Error(
                "Password reset token has expired.",
            );
        }

        if (resetToken.isUsed()) {
            throw new Error(
                "Password reset token has already been used.",
            );
        }

        const account =
            await this.authAccountRepository.findById(
                resetToken.authAccountId,
            );

        if (!account) {
            throw new Error(
                "Authentication account not found.",
            );
        }

        const passwordHash =
            await this.passwordHasher.hash(
                input.newPassword,
            );

        account.changePassword(
            Password.fromHash(passwordHash),
        );

        await this.authAccountRepository.save(
            account,
        );

        resetToken.use();

        await this.passwordResetRepository.save(
            resetToken,
        );
    }
}
