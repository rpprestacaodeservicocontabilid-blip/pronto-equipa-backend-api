import { Request, Response } from 'express';

import { RegisterUseCase } from '../../application/use-cases/register.use-case';
import { StartLoginUseCase } from '../../application/use-cases/start-login.use-case';
import { VerifyLoginOtpUseCase } from '../../application/use-cases/verify-login-otp.use-case';
import { ResendLoginOtpUseCase } from '../../application/use-cases/resend-login-otp.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { InvalidRefreshTokenError, RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import {
  browserRefreshToken,
  clearBrowserSession,
  isBrowserSession,
  permitsBrowserSession,
  sendSession,
} from '../browser-session';

import { VerifyEmailUseCase } from '../../application/use-cases/verify-email.use-case';
import { ResendEmailVerificationUseCase } from '../../application/use-cases/resend-email-verification.use-case';

import { ForgotPasswordUseCase } from '../../application/use-cases/forgot-password.use-case';
import { ResetPasswordUseCase } from '../../application/use-cases/reset-password.use-case';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password.use-case';

// Error handling helper
const handleControllerError = (
  res: Response,
  error: any,
  defaultStatus: number = 500,
): Response => {
  const status = error?.statusCode || defaultStatus;
  const message = error?.message || 'Internal server error';

  if (error?.retryAfterSeconds) {
    res.setHeader('Retry-After', String(error.retryAfterSeconds));
  }

  return res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: error?.stack,
    }),
  });
};

export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly startLoginUseCase: StartLoginUseCase,
    private readonly verifyLoginOtpUseCase: VerifyLoginOtpUseCase,
    private readonly resendLoginOtpUseCase: ResendLoginOtpUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,

    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly resendEmailVerificationUseCase: ResendEmailVerificationUseCase,

    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
  ) {}

  public register = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.body) {
        return res.status(400).json({
          success: false,
          error: 'Request body is required',
        });
      }

      const result = await this.registerUseCase.execute(req.body);

      return res.status(201).json(result);
    } catch (error) {
      return handleControllerError(res, error, 400);
    }
  };

  public login = async (req: Request, res: Response): Promise<Response> => {
    try {
      const identifier = req.body?.identifier ?? req.body?.email ?? req.body?.phone;

      if (!identifier || !req.body?.password) {
        return res.status(400).json({
          success: false,
          error: 'Email or phone number and password are required',
        });
      }

      const result = await this.startLoginUseCase.execute({
        identifier,
        password: req.body.password,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleControllerError(res, error, 401);
    }
  };

  public verifyLoginOtp = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (isBrowserSession(req) && !permitsBrowserSession(req)) {
        return res.status(403).json({ message: 'Browser session requires a same-site request.' });
      }
      if (!req.body?.challengeId || !req.body?.code) {
        return res.status(400).json({
          success: false,
          error: 'Challenge ID and verification code are required',
        });
      }

      const result = await this.verifyLoginOtpUseCase.execute({
        challengeId: Number(req.body.challengeId),
        code: String(req.body.code),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        deviceId: req.body.deviceId,
      });

      return sendSession(req, res, result);
    } catch (error) {
      return handleControllerError(res, error, 401);
    }
  };

  public resendLoginOtp = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.body?.challengeId) {
        return res.status(400).json({
          success: false,
          error: 'Challenge ID is required',
        });
      }

      const result = await this.resendLoginOtpUseCase.execute({
        challengeId: Number(req.body.challengeId),
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleControllerError(res, error, 401);
    }
  };

  public logout = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
      }

      await this.logoutUseCase.execute({
        ...req.body,
        userId: req.user.userId,
        sessionId: req.user.sessionId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      return res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      return handleControllerError(res, error);
    }
  };

  public refreshToken = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.body?.refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Refresh token is required',
        });
      }

      const result = await this.refreshTokenUseCase.execute(req.body);

      return res.status(200).json(result);
    } catch (error) {
      return handleControllerError(res, error, 401);
    }
  };

  public refreshBrowser = async (req: Request, res: Response): Promise<Response> => {
    res.set('Cache-Control', 'no-store');
    if (!permitsBrowserSession(req)) return res.status(403).json({ message: 'Browser session request required.' });
    const refreshToken = browserRefreshToken(req);
    if (!refreshToken) return res.sendStatus(204);
    try {
      // Resuming a browser session is read-only, so simultaneous tabs and repeated reloads can safely retry.
      return res.json(await this.refreshTokenUseCase.resumeBrowserSession(refreshToken));
    } catch (error) {
      if (error instanceof InvalidRefreshTokenError) {
        return res.sendStatus(204);
      }
      return handleControllerError(res, error);
    }
  };

  public logoutBrowser = async (req: Request, res: Response): Promise<Response> => {
    res.set('Cache-Control', 'no-store');
    if (!permitsBrowserSession(req)) return res.status(403).json({ message: 'Browser session request required.' });
    const token = browserRefreshToken(req);
    if (!token) {
      clearBrowserSession(req, res);
      return res.sendStatus(204);
    }
    try {
      const identity = await this.refreshTokenUseCase.identifyBrowserSession(token);
      // A tab from a previous sign-in cannot close the newer browser session.
      if (req.body?.sessionId !== String(identity.sessionId)) return res.sendStatus(409);
      await this.logoutUseCase.execute({
        userId: identity.userId,
        sessionId: identity.sessionId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      clearBrowserSession(req, res);
      return res.sendStatus(204);
    } catch (error) {
      if (error instanceof InvalidRefreshTokenError) {
        clearBrowserSession(req, res);
        return res.sendStatus(204);
      }
      return handleControllerError(res, error);
    }
  };

  public verifyEmail = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.body?.token && !(req.body?.challengeId && req.body?.code)) {
        return res.status(400).json({
          success: false,
          error: 'Verification token is required',
        });
      }

      const result = await this.verifyEmailUseCase.execute(req.body);

      return res.status(200).json(result);
    } catch (error) {
      return handleControllerError(res, error, 400);
    }
  };

  public resendEmailVerification = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user?.userId && !req.body?.email) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
      }

      const result = await this.resendEmailVerificationUseCase.execute({
        userId: req.user?.userId,
        email: req.body?.email,
      });

      return res.status(200).json(result ?? { success: true });
    } catch (error) {
      return handleControllerError(res, error);
    }
  };

  public forgotPassword = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.body?.email) {
        return res.status(400).json({
          success: false,
          error: 'Email is required',
        });
      }

      const result = await this.forgotPasswordUseCase.execute(req.body);

      return res.status(200).json(result);
    } catch (error) {
      return handleControllerError(res, error, 400);
    }
  };

  public resetPassword = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.body?.token || !req.body?.newPassword || !req.body?.confirmPassword) {
        return res.status(400).json({
          success: false,
          error: 'Token, new password and password confirmation are required',
        });
      }

      await this.resetPasswordUseCase.execute(req.body);

      return res.status(200).json({
        success: true,
        message: 'Password reset successfully',
      });
    } catch (error) {
      return handleControllerError(res, error, 400);
    }
  };

  public changePassword = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
      }

      if (!req.body?.currentPassword || !req.body?.newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Current and new passwords are required',
        });
      }

      const result = await this.changePasswordUseCase.execute({
        ...req.body,
        userId: req.user.userId,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleControllerError(res, error, 400);
    }
  };
}
