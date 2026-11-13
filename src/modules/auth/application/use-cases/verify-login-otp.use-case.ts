import { AuthAccountRepository } from "../../domain/repositories/auth-account.repository";
import { VerificationTokenRepository } from "../../domain/repositories/verification-token.repository";
import { AuthenticationService } from "../../domain/services/authentication.service";
import { LoginAttemptService } from "../../domain/services/login-attempt.service";
import { TokenType } from "../../domain/enums/token-type.enum";

import { OtpServicePort } from "../ports/otp-service.port";
import { TokenServicePort } from "../ports/token-service.port";
import { SessionManagerPort } from "../ports/session-manager.port";
import { SecurityServicePort } from "../ports/security-service.port";
import { AuditServicePort } from "../ports/audit-service.port";

import {
    authError,
} from "../errors/auth-application-error";

import { LOGIN_OTP_MAX_ATTEMPTS } from "./start-login.use-case";

export interface RoleProvider {
    getRoleNames(
        userId: number,
    ): Promise<string[]>;

    getPermissionNames?(
        userId: number,
    ): Promise<string[]>;
}

export interface VerifyLoginOtpInput {
    challengeId: number;

    code: string;

    ipAddress?: string | null;

    userAgent?: string | null;

    deviceId?: string | null;
}

export interface LoginResult {
    userId: number;

    sessionId: number;

    accessToken: string;

    refreshToken: string;

    accessTokenExpiresAt: Date;

    refreshTokenExpiresAt: Date;
}

export class VerifyLoginOtpUseCase {
    constructor(
        private readonly authAccountRepository: AuthAccountRepository,

        private readonly verificationTokenRepository: VerificationTokenRepository,

        private readonly authenticationService: AuthenticationService,

        private readonly loginAttemptService: LoginAttemptService,

        private readonly otpService: OtpServicePort,

        private readonly tokenService: TokenServicePort,

        private readonly sessionManager: SessionManagerPort,

        private readonly securityService: SecurityServicePort,

        private readonly auditService: AuditServicePort,

        private readonly roleProvider?: RoleProvider,
    ) { }

    async execute(
        input: VerifyLoginOtpInput,
    ): Promise<LoginResult> {
        if (
            !Number.isInteger(
                input.challengeId,
            ) ||
            input.challengeId <= 0
        ) {
            throw authError(
                "Invalid login challenge.",
                400,
            );
        }

        if (
            typeof input.code !== "string" ||
            !/^\d{6}$/.test(
                input.code.trim(),
            )
        ) {
            throw authError(
                "A 6-digit verification code is required.",
                400,
            );
        }

        const challenge =
            await this.verificationTokenRepository.findById(
                input.challengeId,
            );

        if (
            !challenge ||
            challenge.type !==
            TokenType.LOGIN_OTP ||
            !challenge.isValid()
        ) {
            throw authError(
                "Invalid or expired login challenge.",
                401,
            );
        }

        if (
            challenge.hasReachedMaxAttempts(
                LOGIN_OTP_MAX_ATTEMPTS,
            )
        ) {
            challenge.invalidate();

            await this.verificationTokenRepository.save(
                challenge,
            );

            throw authError(
                "Too many verification attempts. Request a new code.",
                429,
            );
        }

        const codeMatches =
            this.otpService.matches(
                input.code.trim(),
                challenge.token,
            );

        if (!codeMatches) {
            challenge.registerAttempt();

            await this.verificationTokenRepository.save(
                challenge,
            );

            if (
                challenge.hasReachedMaxAttempts(
                    LOGIN_OTP_MAX_ATTEMPTS,
                )
            ) {
                challenge.invalidate();

                await this.verificationTokenRepository.save(
                    challenge,
                );

                throw authError(
                    "Too many verification attempts. Request a new code.",
                    429,
                );
            }

            throw authError(
                "Invalid verification code.",
                401,
            );
        }

        challenge.use();

        await this.verificationTokenRepository.save(
            challenge,
        );

        const account =
            await this.authAccountRepository.findById(
                challenge.authAccountId,
            );

        if (!account) {
            throw authError(
                "Authentication account not found.",
                401,
            );
        }

        await this.authenticationService.validateLogin(
            account,
        );

        const session =
            await this.sessionManager.createSession({
                authAccountId:
                    account.id.getValue(),
                userId: account.userId,
                ipAddress:
                    input.ipAddress ?? null,
                userAgent:
                    input.userAgent ?? null,
                deviceId:
                    input.deviceId ?? null,
                accessTokenExpiresAt:
                    new Date(
                        Date.now() +
                        15 * 60 * 1000,
                    ),
                refreshTokenExpiresAt:
                    new Date(
                        Date.now() +
                        7 * 24 * 60 * 60 * 1000,
                    ),
            });

        const assignedRoles =
            this.roleProvider
                ? await this.roleProvider.getRoleNames(
                    account.userId,
                )
                : [];

        const assignedPermissions =
            this.roleProvider?.getPermissionNames
                ? await this.roleProvider.getPermissionNames(
                    account.userId,
                )
                : [];

        const accessToken =
            await this.tokenService.generateAccessToken({
                userId: account.userId,
                sessionId: session.sessionId,
                roles: [
                    ...account.roles,
                    ...assignedRoles,
                ],
                permissions:
                    assignedPermissions,
            });

        const refreshToken =
            await this.sessionManager.registerRefreshToken({
                sessionId:
                    session.sessionId,
                createToken: (tokenId) =>
                    this.tokenService.generateRefreshToken({
                        userId: account.userId,
                        sessionId:
                            session.sessionId,
                        tokenId,
                    }),
            });

        account.recordSuccessfulLogin();

        await this.authAccountRepository.save(
            account,
        );

        await this.loginAttemptService.recordSuccess(
            account.email.getValue(),
        );

        await this.securityService.recordSuccessfulAttempt({
            userId: account.userId,
            ipAddress:
                input.ipAddress ?? null,
            userAgent:
                input.userAgent ?? null,
            action: "LOGIN",
        });

        await this.auditService.record({
            userId: account.userId,
            action: "USER_AUTHENTICATED",
            resource: "session",
            resourceId: String(
                session.sessionId,
            ),
            ipAddress:
                input.ipAddress ?? null,
            userAgent:
                input.userAgent ?? null,
        });

        return {
            userId: account.userId,
            sessionId: session.sessionId,
            accessToken:
                accessToken.token,
            refreshToken:
                refreshToken.token,
            accessTokenExpiresAt:
                accessToken.expiresAt,
            refreshTokenExpiresAt:
                refreshToken.expiresAt,
        };
    }
}
