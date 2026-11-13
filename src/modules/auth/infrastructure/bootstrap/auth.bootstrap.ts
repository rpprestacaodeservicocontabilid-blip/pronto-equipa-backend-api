import { Router } from "express";

import { authRoutes } from "../http/routes/auth.routes";
import { sessionRoutes } from "../http/routes/session.routes";
import { oauthRoutes } from "../http/routes/oauth.routes";
import { AuthController } from "../http/controller/auth.controller";
import { SessionController } from "../http/controller/session.controller";
import { OAuthController } from "../http/controller/oauth.controller";

import { TokenServicePort } from "../../application/ports/token-service.port";
import { RateLimiter } from "../security/rate-limiter";

// Use Cases
import { RegisterUseCase } from "../../application/use-cases/register.use-case";
import { StartLoginUseCase } from "../../application/use-cases/start-login.use-case";
import { VerifyLoginOtpUseCase } from "../../application/use-cases/verify-login-otp.use-case";
import { ResendLoginOtpUseCase } from "../../application/use-cases/resend-login-otp.use-case";
import { LogoutUseCase } from "../../application/use-cases/logout.use-case";
import { RefreshTokenUseCase } from "../../application/use-cases/refresh-token.use-case";
import { VerifyEmailUseCase } from "../../application/use-cases/verify-email.use-case";
import { ResendEmailVerificationUseCase } from "../../application/use-cases/resend-email-verification.use-case";
import { ForgotPasswordUseCase } from "../../application/use-cases/forgot-password.use-case";
import { ResetPasswordUseCase } from "../../application/use-cases/reset-password.use-case";
import { ChangePasswordUseCase } from "../../application/use-cases/change-password.use-case";
import { GetCurrentSessionUseCase } from "../../application/use-cases/get-current-session.use-case";
import { RevokeSessionUseCase } from "../../application/use-cases/revoke-session.use-case";
import { RevokeAllSessionsUseCase } from "../../application/use-cases/revoke-all-sessions.use-case";
import { LoginWithGoogleUseCase } from "../../application/use-cases/login-with-google.use-case";
import { LinkGoogleAccountUseCase } from "../../application/use-cases/link-google-account.use-case";
import { UnlinkGoogleAccountUseCase } from "../../application/use-cases/unlink-google-account.use-case";

import { SequelizeAuthAccountRepository } from "../persistence/repository/sequelize-auth-account.repository";

// Infraestrutura
import { JwtTokenService } from "../service/jwt-token.service";
import { UserGatewayImpl } from "../integrations/user/user.gateway.impl";
import { BcryptPasswordHasher } from "../service/bcrypt-password-hasher";
import { EmailService } from "../integrations/notifications/email.service";
import { SmsService } from "../integrations/notifications/sms.service";
import { OtpService } from "../service/otp.service";
import { AuditService } from "../service/audit.service";
import { SequelizeUserRepository } from "../../../user/infrastructure/persistence/repositories/sequelize-user.repository";
import { SequelizeRoleRepository } from "../../../user/infrastructure/persistence/repositories/sequelize-role.repository";
import { RoleClaimsService } from "../../../user/infrastructure/services/role-claims.service";
import { UserRoleModel } from "../persistence/model/user-role.model";
import { UserProfileModel } from "../../../user/infrastructure/persistence/models/user-profile.model";
import { AuthenticationServiceImpl } from "../service/authentication.service";
import { LoginAttemptServiceImpl } from "../service/login-attempt.service";
import { SecurityService } from "../service/security.service";
import { SessionManagerService } from "../service/session-manager.service";
import { GoogleOAuthProvider } from "../integrations/google/google-oauth.provider";
import { SequelizeVerificationTokenRepository } from "../persistence/repository/sequelize-verification-token.repository";
import { SequelizePasswordResetTokenRepository } from "../persistence/repository/sequelize-password-reset.repository";
import { ENV } from "../../../../config/env";

export function createAuthRoutes(): Router {
    // ============================================================
    // TOKEN SERVICE
    // ============================================================

    const tokenService: TokenServicePort =
        new JwtTokenService(
            ENV.JWT.SECRET,
            ENV.JWT.EXPIRES_IN || "15m",
        );

    // ============================================================
    // RATE LIMITER
    // ============================================================

    const authRateLimiter: RateLimiter =
        new RateLimiter({
            // O login passou a ter dois passos (credenciais + OTP),
            // por isso o limite cobre o fluxo completo.
            maxAttempts: 20,
            windowMs: 15 * 60 * 1000,
        });

    // ============================================================
    // REPOSITORIES
    // ============================================================

    const userRepository =
        new SequelizeUserRepository();

    const authAccountRepository =
        new SequelizeAuthAccountRepository();

    const userGateway =
        new UserGatewayImpl(userRepository);

    const userRoleRepository =
        new SequelizeRoleRepository();

    const roleAssigner = {
        assignRole: async (
            userId: number,
            roleName: string,
        ): Promise<void> => {
            const role =
                await userRoleRepository.findByName(
                    roleName,
                );

            if (!role) {
                throw new Error(
                    `Role ${roleName} not found.`,
                );
            }

            await UserRoleModel.findOrCreate({
                where: {
                    userId,
                    roleId: role.id,
                },
                defaults: {
                    userId,
                    roleId: role.id,
                    createdAt: new Date(),
                } as any,
            });
        },
    };

    const profileEnsurer = {
        ensureProfile: async (
            userId: number,
            avatarUrl?: string,
        ): Promise<void> => {
            const now = new Date();

            await UserProfileModel.findOrCreate({
                where: { userId },
                defaults: {
                    userId,
                    ...(avatarUrl ? { avatar: avatarUrl } : {}),
                    createdAt: now,
                    updatedAt: now,
                },
            });
        },
    };

    const roleProvider = new RoleClaimsService();

    const passwordHasher =
        new BcryptPasswordHasher();

    const emailService =
        new EmailService();

    const smsService =
        new SmsService();

    const otpService =
        new OtpService(ENV.JWT.SECRET);

    const auditService =
        new AuditService();

    const authenticationService =
        new AuthenticationServiceImpl();

    const loginAttemptService =
        new LoginAttemptServiceImpl();

    const securityService =
        new SecurityService();

    const sessionManager =
        new SessionManagerService();

    const verificationTokenRepository =
        new SequelizeVerificationTokenRepository();

    const passwordResetRepository =
        new SequelizePasswordResetTokenRepository();

    // ============================================================
    // USE CASES
    // ============================================================
    const registerUseCase =
        new RegisterUseCase(
            authAccountRepository,
            userGateway,
            passwordHasher,
            verificationTokenRepository,
            emailService,
            auditService,
            roleAssigner,
            profileEnsurer,
            otpService,
        );

    const startLoginUseCase =
        new StartLoginUseCase(
            authAccountRepository,
            userGateway,
            verificationTokenRepository,
            authenticationService,
            loginAttemptService,
            passwordHasher,
            securityService,
            auditService,
            emailService,
            smsService,
            otpService,
        );

    const verifyLoginOtpUseCase =
        new VerifyLoginOtpUseCase(
            authAccountRepository,
            verificationTokenRepository,
            authenticationService,
            loginAttemptService,
            otpService,
            tokenService,
            sessionManager,
            securityService,
            auditService,
            roleProvider,
        );

    const resendLoginOtpUseCase =
        new ResendLoginOtpUseCase(
            authAccountRepository,
            verificationTokenRepository,
            emailService,
            smsService,
            otpService,
        );

    const logoutUseCase =
        new LogoutUseCase(sessionManager, auditService);

    const refreshTokenUseCase =
        new RefreshTokenUseCase(
            tokenService,
            sessionManager,
            roleProvider.getRoleNames.bind(roleProvider),
            roleProvider.getPermissionNames.bind(roleProvider),
        );

    const verifyEmailUseCase =
        new VerifyEmailUseCase(
            verificationTokenRepository,
            authAccountRepository,
            auditService,
            otpService,
        );

    const resendEmailVerificationUseCase =
        new ResendEmailVerificationUseCase(
            authAccountRepository,
            verificationTokenRepository,
            emailService,
            otpService,
        );

    const forgotPasswordUseCase =
        new ForgotPasswordUseCase(
            authAccountRepository,
            passwordResetRepository,
            emailService,
        );

    const resetPasswordUseCase =
        new ResetPasswordUseCase(
            passwordResetRepository,
            authAccountRepository,
            passwordHasher,
        );

    const changePasswordUseCase =
        new ChangePasswordUseCase(
            authAccountRepository,
            passwordHasher,
            sessionManager,
        );



    // ============================================================
    // CONTROLLER
    // ============================================================

    const controller =
        new AuthController(
            registerUseCase,
            startLoginUseCase,
            verifyLoginOtpUseCase,
            resendLoginOtpUseCase,
            logoutUseCase,
            refreshTokenUseCase,
            verifyEmailUseCase,
            resendEmailVerificationUseCase,
            forgotPasswordUseCase,
            resetPasswordUseCase,
            changePasswordUseCase,
        );

    // ============================================================
    // ROUTES
    // ============================================================

    return authRoutes(
        controller,
        tokenService,
        authRateLimiter,
    );
}

export function createSessionRoutes(): Router {
    const tokenService: TokenServicePort =
        new JwtTokenService(
            ENV.JWT.SECRET,
            ENV.JWT.EXPIRES_IN || "15m",
        );

    const sessionManager =
        new SessionManagerService();

    const controller =
        new SessionController(
            new GetCurrentSessionUseCase(
                sessionManager,
            ),
            new RevokeSessionUseCase(
                sessionManager,
            ),
            new RevokeAllSessionsUseCase(
                sessionManager,
            ),
        );

    return sessionRoutes(
        controller,
        tokenService,
    );
}

export function createOAuthRoutes(): Router {
    const tokenService: TokenServicePort =
        new JwtTokenService(
            ENV.JWT.SECRET,
            ENV.JWT.EXPIRES_IN || "15m",
        );

    const authAccountRepository =
        new SequelizeAuthAccountRepository();

    const userRepository =
        new SequelizeUserRepository();

    const userGateway =
        new UserGatewayImpl(userRepository);

    const sessionManager =
        new SessionManagerService();

    const oauthProvider =
        new GoogleOAuthProvider({
            clientId: ENV.GOOGLE.CLIENT_ID,
            clientSecret: ENV.GOOGLE.CLIENT_SECRET,
            redirectUri: ENV.GOOGLE.REDIRECT_URI,
        });

    const oauthRoleProvider = new RoleClaimsService();

    const controller =
        new OAuthController(
            new LoginWithGoogleUseCase(
                oauthProvider,
                authAccountRepository,
                userGateway,
                tokenService,
                sessionManager,
                oauthRoleProvider,
            ),
            new LinkGoogleAccountUseCase(
                authAccountRepository,
                oauthProvider,
            ),
            new UnlinkGoogleAccountUseCase(
                authAccountRepository,
            ),
        );

    return oauthRoutes(
        controller,
        tokenService,
    );
}
