import { AuthAccountRepository } from "../../domain/repositories/auth-account.repository";
import { VerificationTokenRepository } from "../../domain/repositories/verification-token.repository";
import { AuthenticationService } from "../../domain/services/authentication.service";
import { LoginAttemptService } from "../../domain/services/login-attempt.service";
import { TokenType } from "../../domain/enums/token-type.enum";
import { Email } from "../../domain/value-objects/email.vo";
import { PhoneNumber } from "../../domain/value-objects/phone-number.vo";

import { UserGateway } from "../../domain/gateways/user.gateway";

import { PasswordHasherPort } from "../ports/password-hasher.port";
import { SecurityServicePort } from "../ports/security-service.port";
import { AuditServicePort } from "../ports/audit-service.port";
import { EmailServicePort } from "../ports/email-service.port";
import { SmsServicePort } from "../ports/sms-service.port";
import { OtpServicePort } from "../ports/otp-service.port";

import {
    authError,
} from "../errors/auth-application-error";

import {
    DestinationChannel,
    maskDestination,
} from "../utils/mask-destination";

export const LOGIN_OTP_TTL_MINUTES = 10;

export const LOGIN_OTP_MAX_ATTEMPTS = 5;

export const LOGIN_OTP_RESEND_COOLDOWN_SECONDS = 60;

export type LoginChannel =
    DestinationChannel;

export interface StartLoginInput {
    /** Email ou telefone. */
    identifier?: string;

    email?: string;

    phone?: string;

    password: string;

    ipAddress?: string | null;

    userAgent?: string | null;
}

export interface StartLoginResult {
    otpRequired: true;

    challengeId: number;

    channel: LoginChannel;

    /** Destino mascarado (ex.: j***@email.com). */
    destination: string;

    expiresAt: Date;

    /**
     * Apenas em ambientes não-produção, para permitir
     * testar o fluxo sem um provider de email/SMS real.
     */
    developmentCode?: string;
}

interface ResolvedIdentifier {
    channel: LoginChannel;

    value: string;
}

export class StartLoginUseCase {
    constructor(
        private readonly authAccountRepository: AuthAccountRepository,

        private readonly userGateway: UserGateway,

        private readonly verificationTokenRepository: VerificationTokenRepository,

        private readonly authenticationService: AuthenticationService,

        private readonly loginAttemptService: LoginAttemptService,

        private readonly passwordHasher: PasswordHasherPort,

        private readonly securityService: SecurityServicePort,

        private readonly auditService: AuditServicePort,

        private readonly emailService: EmailServicePort,

        private readonly smsService: SmsServicePort,

        private readonly otpService: OtpServicePort,
    ) { }

    async execute(
        input: StartLoginInput,
    ): Promise<StartLoginResult> {
        const identifier =
            this.resolveIdentifier(input);

        const account =
            await this.findAccount(
                identifier,
            );

        if (!account) {
            await this.recordFailure(
                identifier.value,
                null,
                input,
            );

            throw authError(
                "Invalid credentials.",
                401,
            );
        }

        const passwordHash =
            account.password?.getValue();

        // Contas OAuth não têm password local.
        if (!passwordHash) {
            await this.recordFailure(
                identifier.value,
                account.userId,
                input,
            );

            throw authError(
                "Invalid credentials.",
                401,
            );
        }

        const passwordValid =
            await this.passwordHasher.compare(
                input.password,
                passwordHash,
            );

        if (!passwordValid) {
            await this.recordFailure(
                identifier.value,
                account.userId,
                input,
            );

            throw authError(
                "Invalid credentials.",
                401,
            );
        }

        await this.authenticationService.validateLogin(
            account,
        );

        const security =
            await this.securityService.check({
                userId: account.userId,
                ipAddress:
                    input.ipAddress ?? null,
                userAgent:
                    input.userAgent ?? null,
                action: "LOGIN",
            });

        if (!security.allowed) {
            await this.recordFailure(
                identifier.value,
                account.userId,
                input,
            );

            throw authError(
                security.reason ??
                "Login blocked by security policy.",
                401,
            );
        }

        const now = new Date();

        // Apenas um desafio ativo por conta.
        await this.verificationTokenRepository.invalidateActive(
            account.id.getValue(),
            TokenType.LOGIN_OTP,
            now,
        );

        const code =
            this.otpService.generateCode();

        const expiresAt =
            new Date(
                now.getTime() +
                LOGIN_OTP_TTL_MINUTES * 60 * 1000,
            );

        const challenge =
            await this.verificationTokenRepository.createOtp({
                authAccountId:
                    account.id.getValue(),
                codeHash:
                    this.otpService.hash(code),
                channel: identifier.channel,
                destination: identifier.value,
                expiresAt,
            });

        await this.deliverCode(
            identifier,
            code,
        );

        await this.auditService.record({
            userId: account.userId,
            action: "LOGIN_OTP_SENT",
            resource: "auth-account",
            resourceId: String(
                account.id.getValue(),
            ),
            ipAddress:
                input.ipAddress ?? null,
            userAgent:
                input.userAgent ?? null,
        });

        const result: StartLoginResult = {
            otpRequired: true,
            challengeId: challenge.id,
            channel: identifier.channel,
            destination: maskDestination(
                identifier.channel,
                identifier.value,
            ),
            expiresAt,
        };

        // O provider de email/SMS atual é um no-op.
        // Expor o código apenas fora de produção permite
        // testar o fluxo localmente.
        if (
            process.env.NODE_ENV !==
            "production"
        ) {
            result.developmentCode = code;
        }

        return result;
    }

    private resolveIdentifier(
        input: StartLoginInput,
    ): ResolvedIdentifier {
        const raw =
            input.identifier ??
            input.email ??
            input.phone ??
            "";

        const trimmed = raw.trim();

        if (!trimmed) {
            throw authError(
                "Email or phone number is required.",
                400,
            );
        }

        if (trimmed.includes("@")) {
            return {
                channel: "email",
                value: Email.create(trimmed)
                    .getValue(),
            };
        }

        return {
            channel: "sms",
            value: PhoneNumber.create(trimmed)
                .getValue(),
        };
    }

    private async findAccount(
        identifier: ResolvedIdentifier,
    ) {
        if (identifier.channel === "email") {
            return this.authAccountRepository.findByEmail(
                identifier.value,
            );
        }

        const user =
            await this.userGateway.findByPhone(
                identifier.value,
            );

        if (!user) {
            return null;
        }

        return this.authAccountRepository.findByUserId(
            user.id,
        );
    }

    private async deliverCode(
        identifier: ResolvedIdentifier,
        code: string,
    ): Promise<void> {
        if (identifier.channel === "email") {
            await this.emailService.send({
                to: identifier.value,
                subject: "O seu código de acesso",
                template: "login-otp",
                variables: {
                    code,
                    expiresInMinutes:
                        LOGIN_OTP_TTL_MINUTES,
                },
            });

            return;
        }

        await this.smsService.send({
            phoneNumber: identifier.value,
            message:
                `Peladeiro: o seu código de acesso é ${code}. ` +
                `Válido por ${LOGIN_OTP_TTL_MINUTES} minutos.`,
        });
    }

    private async recordFailure(
        identifier: string,
        userId: number | null,
        input: StartLoginInput,
    ): Promise<void> {
        await this.loginAttemptService.recordFailure(
            identifier,
        );

        await this.securityService.recordFailedAttempt({
            userId: userId ?? undefined,
            ipAddress:
                input.ipAddress ?? null,
            userAgent:
                input.userAgent ?? null,
            action: "LOGIN",
        });
    }
}
