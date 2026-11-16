import { Request, Response, NextFunction } from 'express';
import { PlatformRoleCheckerPort } from '../../application/ports/platform-role-checker.port';

/**
 * Exige uma role de PLATAFORMA atribuída actualmente ao utilizador.
 *
 * As claims do JWT não são suficientes: uma atribuição revogada tem
 * de deixar de autorizar sessões que ainda não expiraram.
 *
 * Uso: `/api/v1/platform/*` com `requirePlatformRole("SUPER_ADMIN")`.
 */
export const createRequirePlatformRole =
  (checker: PlatformRoleCheckerPort) =>
  (...requiredRoles: string[]) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userId = req.user?.userId;

        if (!userId) {
          res.status(401).json({
            message: 'Authentication required.',
          });

          return;
        }

        const allowed = await checker.hasAnyRole(userId, requiredRoles);

        if (!allowed) {
          res.status(403).json({
            success: false,
            error: {
              message: 'Access denied.',
              code: 'FORBIDDEN',
              statusCode: 403,
              timestamp: new Date().toISOString(),
            },
          });

          return;
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };
