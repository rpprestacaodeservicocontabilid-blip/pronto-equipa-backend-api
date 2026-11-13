import crypto from "crypto";

export class TwoFactorAuthService {
    generateSecret(): string {
        return crypto
            .randomBytes(20)
            .toString("base64");
    }

    generateVerificationCode(): string {
        return crypto
            .randomInt(100000, 1000000)
            .toString();
    }

    verifyCode(
        expected: string,
        provided: string,
    ): boolean {
        return expected === provided;
    }
}