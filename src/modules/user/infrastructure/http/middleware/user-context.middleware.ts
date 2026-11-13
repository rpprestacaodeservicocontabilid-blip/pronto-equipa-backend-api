import { Request, Response, NextFunction } from "express";

export interface AuthenticatedUserContext {
    userId: number;
    authAccountId?: number;
    sessionId?: number;
    roles?: string[];
    permissions?: string[];
}

declare global {
    namespace Express {
        interface Request {
            userContext?: AuthenticatedUserContext;
        }
    }
}

export const userContextMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    const authUser = (req as any).user;

    if (!authUser) {
        res.status(401).json({
            message: "Utilizador não autenticado.",
        });

        return;
    }

    req.userContext = {
        userId: Number(authUser.userId),
        authAccountId: authUser.authAccountId
            ? Number(authUser.authAccountId)
            : undefined,
        sessionId: authUser.sessionId
            ? Number(authUser.sessionId)
            : undefined,
        roles: authUser.roles,
        permissions: authUser.permissions,
    };

    next();
};