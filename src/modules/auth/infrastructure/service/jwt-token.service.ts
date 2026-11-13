import jwt, { type SignOptions } from "jsonwebtoken";

import {
    TokenServicePort,
    AccessTokenPayload,
    RefreshTokenPayload,
} from "../../application/ports/token-service.port";

export interface JwtPayload {
    sub: string;
    sessionId: string;
    type: "access" | "refresh";
    iat?: number;
    exp?: number;
}

/**
 * JWT Token Service - Implements TokenServicePort
 * Generates and validates JWT tokens for authentication
 */
export class JwtTokenService
    implements TokenServicePort {
    constructor(
        private readonly secret: string,
        private readonly expiresIn: string = "15m",
        private readonly refreshExpiresIn: string = "7d",
    ) {
        if (typeof secret !== "string" || !secret.trim()) {
            throw new Error("JWT_SECRET is not configured. Set JWT_SECRET in the environment before starting the server.");
        }
    }

    /**
     * Generates an access token with user permissions/roles
     */
    async generateAccessToken(
        payload: AccessTokenPayload,
    ): Promise<{
        token: string;
        expiresAt: Date;
    }> {
        const token = jwt.sign(
            {
                sub: String(payload.userId),
                sessionId: String(
                    payload.sessionId,
                ),
                roles: payload.roles,
                permissions: payload.permissions,
                type: "access",
            },
            this.secret,
            {
                expiresIn: this.expiresIn as SignOptions["expiresIn"],
            },
        );

        // Calculate expiration date
        const decoded = jwt.decode(token) as any;
        const expiresAt = new Date(
            (decoded?.exp || 0) * 1000,
        );

        return {
            token,
            expiresAt,
        };
    }

    /**
     * Generates a refresh token for session refresh
     */
    async generateRefreshToken(
        payload: RefreshTokenPayload,
    ): Promise<{
        token: string;
        expiresAt: Date;
    }> {
        const token = jwt.sign(
            {
                sub: String(payload.userId),
                sessionId: String(
                    payload.sessionId,
                ),
                tokenId: payload.tokenId,
                type: "refresh",
            },
            this.secret,
            {
                expiresIn: this.refreshExpiresIn as SignOptions["expiresIn"],
            },
        );

        // Calculate expiration date
        const decoded = jwt.decode(token) as any;
        const expiresAt = new Date(
            (decoded?.exp || 0) * 1000,
        );

        return {
            token,
            expiresAt,
        };
    }

    /**
     * Verifies and decodes an access token
     */
    async verifyAccessToken(
        token: string,
    ): Promise<AccessTokenPayload> {
        try {
            const decoded = jwt.verify(
                token,
                this.secret,
                { algorithms: ["HS256"] },
            ) as any;

            if (decoded.type !== "access") {
                throw new Error(
                    "Token is not an access token",
                );
            }

            const userId = Number(decoded.sub);
            const sessionId = Number(decoded.sessionId);
            if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(sessionId) || sessionId <= 0 || !Array.isArray(decoded.roles) || !decoded.roles.every((role: unknown) => typeof role === "string") || !Array.isArray(decoded.permissions) || !decoded.permissions.every((permission: unknown) => typeof permission === "string")) {
                throw new Error("Malformed access token claims");
            }
            return { userId, sessionId, roles: decoded.roles, permissions: decoded.permissions };
        } catch (error) {
            throw new Error(
                `Invalid access token: ${error instanceof Error
                    ? error.message
                    : "Unknown error"
                }`,
            );
        }
    }

    /**
     * Verifies and decodes a refresh token
     */
    async verifyRefreshToken(
        token: string,
    ): Promise<RefreshTokenPayload> {
        try {
            const decoded = jwt.verify(
                token,
                this.secret,
                { algorithms: ["HS256"] },
            ) as any;

            if (decoded.type !== "refresh") {
                throw new Error(
                    "Token is not a refresh token",
                );
            }

            const userId = Number(decoded.sub);
            const sessionId = Number(decoded.sessionId);
            const tokenId = Number(decoded.tokenId);
            if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(sessionId) || sessionId <= 0 || !Number.isSafeInteger(tokenId) || tokenId <= 0) {
                throw new Error("Malformed refresh token claims");
            }
            return { userId, sessionId, tokenId };
        } catch (error) {
            throw new Error(
                `Invalid refresh token: ${error instanceof Error
                    ? error.message
                    : "Unknown error"
                }`,
            );
        }
    }
}
