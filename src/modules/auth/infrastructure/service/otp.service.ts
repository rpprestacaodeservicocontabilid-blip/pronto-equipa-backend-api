import crypto from "crypto";

import { OtpServicePort } from "../../application/ports/otp-service.port";

export class OtpService
    implements OtpServicePort {

    constructor(
        private readonly secret: string,
    ) { }

    public generateCode(): string {
        return crypto
            .randomInt(100000, 1000000)
            .toString();
    }

    public hash(code: string): string {
        return crypto
            .createHmac("sha256", this.secret)
            .update(code)
            .digest("hex");
    }

    public matches(
        code: string,
        codeHash: string,
    ): boolean {
        const provided =
            Buffer.from(
                this.hash(code),
                "utf8",
            );

        const expected =
            Buffer.from(codeHash, "utf8");

        if (
            provided.length !==
            expected.length
        ) {
            return false;
        }

        return crypto.timingSafeEqual(
            provided,
            expected,
        );
    }
}
