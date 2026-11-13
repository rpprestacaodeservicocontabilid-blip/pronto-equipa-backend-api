import {
    AuthGateway,
    AuthAccountData,
} from "../../../domain/gateways/auth.gateway";

export interface AuthModuleService {
    getAccountByUserId(
        userId: number,
    ): Promise<{
        userId: number;
        status: string;
        provider: string;
    } | null>;

    activateAccount(
        userId: number,
    ): Promise<void>;

    deactivateAccount(
        userId: number,
    ): Promise<void>;

    deleteAccount(
        userId: number,
    ): Promise<void>;
}

export class AuthGatewayImpl
    implements AuthGateway {
    constructor(
        private readonly authService: AuthModuleService,
    ) { }

    async getAccountByUserId(
        userId: number,
    ): Promise<AuthAccountData | null> {
        const account =
            await this.authService.getAccountByUserId(
                userId,
            );

        if (!account) {
            return null;
        }

        return {
            userId: account.userId,
            status: account.status,
            provider: account.provider,
        };
    }

    async activateAccount(
        userId: number,
    ): Promise<void> {
        await this.authService.activateAccount(
            userId,
        );
    }

    async deactivateAccount(
        userId: number,
    ): Promise<void> {
        await this.authService.deactivateAccount(
            userId,
        );
    }

    async deleteAccount(
        userId: number,
    ): Promise<void> {
        await this.authService.deleteAccount(
            userId,
        );
    }
}