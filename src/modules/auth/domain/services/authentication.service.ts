import { AuthAccount } from '../entities/auth-account.entity';

export interface AuthenticationService {
  /**
   * Valida se a conta pode autenticar-se
   * (estado ativo, não bloqueada, etc.).
   */
  validateLogin(account: AuthAccount): Promise<void>;
}
