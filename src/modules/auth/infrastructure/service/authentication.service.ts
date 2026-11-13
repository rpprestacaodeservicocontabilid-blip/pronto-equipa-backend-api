import { AuthenticationService } from "../../domain/services/authentication.service";
import { AuthAccount } from "../../domain/entities/auth-account.entity";

/**
 * Validates account status for login
 * Checks if account is active, not suspended, not locked, etc.
 */
export class AuthenticationServiceImpl
    implements AuthenticationService {
    async validateLogin(
        account: AuthAccount,
    ): Promise<void> {
        if (!account.canAuthenticate()) {
            throw new Error("Account is inactive, suspended, or locked");
        }
    }
}
