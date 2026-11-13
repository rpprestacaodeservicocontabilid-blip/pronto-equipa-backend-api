import { TokenServicePort } from "../ports/token-service.port";
import { SessionManagerPort } from "../ports/session-manager.port";

export interface RefreshTokenInput {
    refreshToken: string;
}

export interface RefreshTokenResult {
    accessToken: string;

    refreshToken: string;

    accessTokenExpiresAt: Date;

    refreshTokenExpiresAt: Date;
}

export class RefreshTokenUseCase {
    constructor(
        private readonly tokenService: TokenServicePort,

        private readonly sessionManager: SessionManagerPort,
        private readonly getRoleNames?: (userId: number) => Promise<string[]>,
        private readonly getPermissionNames?: (userId: number) => Promise<string[]>,
    ) { }

    async execute(
        input: RefreshTokenInput,
    ): Promise<RefreshTokenResult> {
        const payload =
            await this.tokenService.verifyRefreshToken(
                input.refreshToken,
            );

        const roles = this.getRoleNames ? await this.getRoleNames(payload.userId) : [];
        const permissions = this.getPermissionNames ? await this.getPermissionNames(payload.userId) : [];
        const accessToken = await this.tokenService.generateAccessToken({
            userId: payload.userId,
            sessionId: payload.sessionId,
            roles,
            permissions,
        });
        const refreshToken = await this.sessionManager.rotateRefreshToken({
            sessionId: payload.sessionId,
            tokenId: payload.tokenId,
            token: input.refreshToken,
            createNextToken: (tokenId) => this.tokenService.generateRefreshToken({
                userId: payload.userId,
                sessionId: payload.sessionId,
                tokenId,
            }),
        });
        if (!refreshToken) throw new Error("Refresh token has already been used or the session is inactive.");

        return {
            accessToken: accessToken.token,
            refreshToken: refreshToken.token,
            accessTokenExpiresAt:
                accessToken.expiresAt,
            refreshTokenExpiresAt:
                refreshToken.expiresAt,
        };
    }
}
