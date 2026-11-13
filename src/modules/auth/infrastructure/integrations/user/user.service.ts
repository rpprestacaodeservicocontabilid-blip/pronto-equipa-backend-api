import {
    AuthUserData,
    CreateAuthUserInput,
    UserGateway,
} from "../../../domain/gateways/user.gateway"

/**
 * Placeholder de integração com o módulo User.
 *
 * A implementação real é `UserGatewayImpl`, usada pelo
 * bootstrap de autenticação. Esta classe existe apenas
 * para o wiring alternativo exposto por `auth.module.ts`.
 */
export class UserService
    implements UserGateway {
    async findById(
        userId: number,
    ): Promise<AuthUserData | null> {
        throw new Error(
            "UserService.findById is not implemented.",
        );
    }

    async findByEmail(
        email: string,
    ): Promise<AuthUserData | null> {
        throw new Error(
            "UserService.findByEmail is not implemented.",
        );
    }

    async findByPhone(
        phone: string,
    ): Promise<AuthUserData | null> {
        throw new Error(
            "UserService.findByPhone is not implemented.",
        );
    }

    async createUser(
        input: CreateAuthUserInput,
    ): Promise<AuthUserData> {
        throw new Error(
            "UserService.createUser is not implemented.",
        );
    }

    async updateEmail(
        userId: number,
        email: string,
    ): Promise<void> {
        throw new Error(
            "UserService.updateEmail is not implemented.",
        );
    }
}
