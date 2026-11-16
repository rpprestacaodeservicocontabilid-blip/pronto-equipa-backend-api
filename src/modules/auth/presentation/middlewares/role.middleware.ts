import { Request, Response, NextFunction } from 'express';

export const roleMiddleware = (...requiredRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        message: 'Authentication required.',
      });

      return;
    }

    const userRoles = req.user.roles ?? [];
    if (userRoles.some((role) => ['ADMIN', 'SUPER_ADMIN'].includes(role.toUpperCase()))) {
      next();
      return;
    }

    const hasRole = requiredRoles.some((role) =>
      userRoles.some((userRole) => userRole.toUpperCase() === role.toUpperCase()),
    );

    if (!hasRole) {
      res.status(403).json({
        message: 'Insufficient role.',
      });

      return;
    }

    next();
  };
};
