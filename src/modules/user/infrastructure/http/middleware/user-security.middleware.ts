import {
    Request,
    Response,
    NextFunction,
} from "express";

export const userSecurityMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    const userContext = req.userContext;

    if (!userContext) {
        res.status(401).json({
            message: "Contexto de segurança não encontrado.",
        });

        return;
    }

    if (!userContext.sessionId) {
        res.status(401).json({
            message: "Sessão inválida.",
        });

        return;
    }

    next();
};