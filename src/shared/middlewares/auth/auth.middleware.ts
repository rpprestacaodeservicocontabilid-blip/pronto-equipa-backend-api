import { Request, Response, NextFunction } from 'express';
import { logger } from '../../../config/logger';
import { JwtTokenService } from '../../../modules/auth/infrastructure/service/jwt-token.service';
import { SessionManagerService } from '../../../modules/auth/infrastructure/service/session-manager.service';

/**
 * Interface para payload JWT
 */
export interface JWTPayload {
  id: number;
  email?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  sessionId: number;
  cityId?: number;
  teamId?: number;
  iat?: number;
  exp?: number;
}

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

function hasAdminRole(user: JWTPayload): boolean {
  const roles = user.roles?.length ? user.roles : [user.role ?? ''];
  return roles.some((role) => ADMIN_ROLES.has(role.toUpperCase()));
}

async function resolveUser(token: string): Promise<JWTPayload> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');

  const tokenService = new JwtTokenService(secret);
  const payload = await tokenService.verifyAccessToken(token);
  const session = await new SessionManagerService().getSession(payload.sessionId);
  if (
    !session ||
    session.status !== 'ACTIVE' ||
    session.userId !== payload.userId ||
    session.expiresAt <= new Date()
  ) {
    throw new Error('Session is no longer active');
  }

  return {
    id: payload.userId,
    sessionId: payload.sessionId,
    role: payload.roles[0],
    roles: payload.roles,
    permissions: payload.permissions,
  };
}

/**
 * Middleware de autenticação JWT
 * Valida token Bearer e coloca payload em req.user
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const [scheme, token, ...extra] = (req.headers.authorization ?? '').trim().split(/\s+/);

  if (scheme !== 'Bearer' || !token || extra.length > 0) {
    logger.warn(`[Auth] Unauthorized access attempt - no token provided from ${req.ip}`);
    res.status(401).json({
      message: 'Unauthorized',
      code: 'NO_TOKEN',
    });
    return;
  }

  try {
    const user = await resolveUser(token);
    (req as any).user = user;
    logger.debug(`[Auth] Authenticated user ${user.id}`);
    next();
  } catch (error: any) {
    logger.warn(`[Auth] Invalid token from ${req.ip}: ${error.message}`);

    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        message: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }

    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        message: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
      return;
    }

    res.status(401).json({
      message: 'Authentication failed',
      code: 'AUTH_FAILED',
    });
  }
}

/**
 * Middleware de autorização por papéis
 */
export function authorize(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as JWTPayload;

    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (hasAdminRole(user)) return next();

    const userRoles = user.roles?.length ? user.roles : [user.role || 'user'];
    const normalizedUserRoles = new Set(userRoles.map((role) => role.toUpperCase()));
    const hasRequiredRole = roles.some((role) => normalizedUserRoles.has(role.toUpperCase()));
    if (!hasRequiredRole) {
      logger.warn(
        `[Auth] User ${user.id} attempted unauthorized action (required roles: ${roles.join(', ')})`,
      );
      return res.status(403).json({
        message: 'Forbidden - insufficient permissions',
        code: 'FORBIDDEN',
      });
    }

    next();
  };
}

/**
 * Middleware de autenticação opcional
 * Tenta autenticar mas não falha se token não existir
 */
export async function authenticateOptional(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { authorization } = req.headers;

  if (authorization) {
    try {
      const [scheme, token, ...extra] = authorization.trim().split(/\s+/);
      if (scheme !== 'Bearer' || !token || extra.length > 0)
        throw new Error('Invalid authorization header');
      (req as any).user = await resolveUser(token);
    } catch (error) {
      logger.debug(`[Auth] Optional auth failed: skipping`);
    }
  }

  next();
}

/**
 * Middleware que verifica se o usuário é proprietário do recurso
 */
export function isResourceOwner(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as JWTPayload;
  if (!user) {
    return res.status(401).json({ message: 'User not authenticated' });
  }
  const resourceUserId = parseInt(req.params.id || req.body.userId || '0');

  const isAdmin = hasAdminRole(user);
  if (user.id !== resourceUserId && !isAdmin) {
    logger.warn(`[Auth] User ${user.id} attempted to access resource of user ${resourceUserId}`);
    return res.status(403).json({
      message: 'Forbidden - not the resource owner',
      code: 'NOT_OWNER',
    });
  }

  next();
}
