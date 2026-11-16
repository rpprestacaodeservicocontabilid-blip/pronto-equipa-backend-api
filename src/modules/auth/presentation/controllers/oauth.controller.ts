import { Request, Response } from 'express';

import { LoginWithGoogleUseCase } from '../../application/use-cases/login-with-google.use-case';
import { LinkGoogleAccountUseCase } from '../../application/use-cases/link-google-account.use-case';
import { UnlinkGoogleAccountUseCase } from '../../application/use-cases/unlink-google-account.use-case';

// Error handling helper
const handleControllerError = (
  res: Response,
  error: any,
  defaultStatus: number = 500,
): Response => {
  const status = error?.statusCode || defaultStatus;
  const message = error?.message || 'Internal server error';

  return res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: error?.stack,
    }),
  });
};

export class OAuthController {
  constructor(
    private readonly loginWithGoogleUseCase: LoginWithGoogleUseCase,
    private readonly linkGoogleAccountUseCase: LinkGoogleAccountUseCase,
    private readonly unlinkGoogleAccountUseCase: UnlinkGoogleAccountUseCase,
  ) {}

  public loginWithGoogle = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.body?.code) {
        return res.status(400).json({
          success: false,
          error: 'Google authorization code is required',
        });
      }

      const result = await this.loginWithGoogleUseCase.execute({
        ...req.body,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleControllerError(res, error, 401);
    }
  };

  public linkGoogleAccount = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
      }

      if (!req.body?.code) {
        return res.status(400).json({
          success: false,
          error: 'Google authorization code is required',
        });
      }

      const result = await this.linkGoogleAccountUseCase.execute({
        userId: req.user.userId,
        ...req.body,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleControllerError(res, error);
    }
  };

  public unlinkGoogleAccount = async (req: Request, res: Response): Promise<Response> => {
    try {
      if (!req.user?.userId) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
      }

      const result = await this.unlinkGoogleAccountUseCase.execute({
        userId: req.user.userId,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleControllerError(res, error);
    }
  };
}
