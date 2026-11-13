import {
    Request,
    Response,
    NextFunction,
} from "express";

import { RateLimiter } from "../../security/rate-limiter";

export const rateLimitMiddleware = (
    rateLimiter: RateLimiter,
    keyResolver?: (
        req: Request,
    ) => string,
) => {
    return (
        req: Request,
        res: Response,
        next: NextFunction,
    ): void => {
        const key =
            keyResolver?.(req) ??
            req.ip ??
            "unknown";

        const result =
            rateLimiter.check(key);

        res.setHeader(
            "X-RateLimit-Remaining",
            result.remaining,
        );

        if (!result.allowed) {
            res.setHeader(
                "Retry-After",
                result.retryAfter,
            );

            res.status(429).json({
                message:
                    "Too many requests. Please try again later.",
            });

            return;
        }

        next();
    };
};