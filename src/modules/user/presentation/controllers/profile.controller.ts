import { Request, Response } from 'express';

import { UpdateProfileUseCase } from '../../application/use-cases/update-profile.use-case';
import { GetUserProfileUseCase } from '../../application/use-cases/get-user-profile.use-case';
import { EnsureProfileUseCase } from '../../application/use-cases/ensure-profile.use-case';

import { UpdateProfileDTO } from '../dto/update-profile.dto';

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

export class ProfileController {
  constructor(
    private readonly updateProfileUseCase: UpdateProfileUseCase,
    private readonly getUserProfileUseCase: GetUserProfileUseCase,
    private readonly ensureProfileUseCase: EnsureProfileUseCase,
  ) {}

  async get(req: Request, res: Response): Promise<Response> {
    try {
      const userId = Number(req.params.userId);

      const profile = await this.getUserProfileUseCase.execute({
        userId,
      });

      return res.status(200).json(profile);
    } catch (error) {
      return handleControllerError(res, error, 404);
    }
  }

  async update(req: Request, res: Response): Promise<Response> {
    try {
      const userId = Number(req.params.userId);

      const input: UpdateProfileDTO = req.body;

      const profile = await this.updateProfileUseCase.execute({
        userId,
        ...input,
      });

      return res.status(200).json(profile);
    } catch (error) {
      return handleControllerError(res, error, 400);
    }
  }

  async ensure(req: Request, res: Response): Promise<Response> {
    try {
      const userId = Number(req.body?.userId ?? req.params.userId);

      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'A valid userId is required',
        });
      }

      const profile = await this.ensureProfileUseCase.execute({
        userId,
      });

      return res.status(201).json(profile);
    } catch (error) {
      return handleControllerError(res, error, 400);
    }
  }

  async me(req: Request, res: Response): Promise<Response> {
    try {
      const userId = Number(req.user?.userId);

      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
      }

      const profile = await this.getUserProfileUseCase.execute({
        userId,
      });

      return res.status(200).json(profile);
    } catch (error) {
      return handleControllerError(res, error, 404);
    }
  }
}
