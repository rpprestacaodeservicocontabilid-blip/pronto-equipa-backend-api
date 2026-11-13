import { Request, Response } from "express";

import { GetCurrentSessionUseCase } from "../../../application/use-cases/get-current-session.use-case";
import { RevokeSessionUseCase } from "../../../application/use-cases/revoke-session.use-case";
import { RevokeAllSessionsUseCase } from "../../../application/use-cases/revoke-all-sessions.use-case";

// Error handling helper
const handleControllerError = (
    res: Response,
    error: any,
    defaultStatus: number = 500,
): Response => {
    const status = error?.statusCode || defaultStatus;
    const message = error?.message || "Internal server error";

    return res.status(status).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === "development" && {
            stack: error?.stack,
        }),
    });
};

export class SessionController {
    constructor(
        private readonly getCurrentSessionUseCase: GetCurrentSessionUseCase,
        private readonly revokeSessionUseCase: RevokeSessionUseCase,
        private readonly revokeAllSessionsUseCase: RevokeAllSessionsUseCase,
    ) { }

    public current = async (
        req: Request,
        res: Response,
    ): Promise<Response> => {
        try {
            if (!req.user?.userId || !req.user?.sessionId) {
                return res.status(401).json({
                    success: false,
                    error: "User not authenticated",
                });
            }

            const result =
                await this.getCurrentSessionUseCase.execute({
                    userId: req.user.userId,
                    sessionId: req.user.sessionId,
                });

            return res.status(200).json(result);
        } catch (error) {
            return handleControllerError(res, error);
        }
    };

    public revoke = async (
        req: Request,
        res: Response,
    ): Promise<Response> => {
        try {
            if (!req.user?.userId) {
                return res.status(401).json({
                    success: false,
                    error: "User not authenticated",
                });
            }

            const sessionId = Number(req.params.sessionId);
            if (isNaN(sessionId) || sessionId <= 0) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid session ID",
                });
            }

            const result =
                await this.revokeSessionUseCase.execute({
                    userId: req.user.userId,
                    sessionId,
                });

            return res.status(200).json(result);
        } catch (error) {
            return handleControllerError(res, error);
        }
    };

    public revokeAll = async (
        req: Request,
        res: Response,
    ): Promise<Response> => {
        try {
            if (!req.user?.userId || !req.user?.sessionId) {
                return res.status(401).json({
                    success: false,
                    error: "User not authenticated",
                });
            }

            const result =
                await this.revokeAllSessionsUseCase.execute({
                    userId: req.user.userId,
                    exceptSessionId:
                        req.user.sessionId,
                });

            return res.status(200).json(result);
        } catch (error) {
            return handleControllerError(res, error);
        }
    };
}