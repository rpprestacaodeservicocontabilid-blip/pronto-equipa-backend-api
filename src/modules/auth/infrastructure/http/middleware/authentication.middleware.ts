import { Request, Response, NextFunction } from "express";

import { TokenServicePort } from "../../../application/ports/token-service.port";
import { SessionManagerPort } from "../../../application/ports/session-manager.port";
import { SessionManagerService } from "../../service/session-manager.service";

export const authenticationMiddleware = (
    tokenService: TokenServicePort,
    sessionManager: SessionManagerPort = new SessionManagerService(),
) => {
    return async (
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> => {
        try {
            const authorization =
                req.headers.authorization;

            if (!authorization) {
                res.status(401).json({
                    message: "Authentication required.",
                });

                return;
            }

            const [scheme, token] =
                authorization.split(" ");

            if (
                scheme !== "Bearer" ||
                !token
            ) {
                res.status(401).json({
                    message: "Invalid authorization header.",
                });

                return;
            }

            const payload =
                await tokenService.verifyAccessToken(
                    token,
                );
            const session = await sessionManager.getSession(payload.sessionId);
            if (!session || session.status !== "ACTIVE" || session.userId !== payload.userId || session.expiresAt <= new Date()) {
                res.status(401).json({ message: "Session is no longer active." });
                return;
            }

            req.user = {
                userId: payload.userId,
                accountId: session.authAccountId,
                sessionId: payload.sessionId,
                roles: payload.roles ?? [],
                permissions:
                    payload.permissions ?? [],
            };

            next();
        } catch {
            res.status(401).json({
                message: "Invalid or expired token.",
            });
        }
    };
};
