import {
    Request,
    Response,
    NextFunction,
} from "express";

export const authorizationMiddleware = (
    requiredPermission: string,
) => {
    return (
        req: Request,
        res: Response,
        next: NextFunction,
    ): void => {
        if (!req.user) {
            res.status(401).json({
                message: "Authentication required.",
            });

            return;
        }

        if ((req.user.roles ?? []).some((role) => ["ADMIN", "SUPER_ADMIN"].includes(role.toUpperCase()))) {
            next();
            return;
        }

        if (
            !(req.user.permissions ?? []).includes(
                requiredPermission,
            )
        ) {
            res.status(403).json({
                message: "Access denied.",
            });

            return;
        }

        next();
    };
};
