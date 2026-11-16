/**
 * Dados de conta de autenticação expostos pelo gateway.
 */
export interface AuthAccountData {
  userId: number;
  status: string;
  provider: string;
}

/**
 * Porta de acesso ao módulo de autenticação.
 *
 * Espelha o contrato efectivamente implementado pelo
 * `AuthGatewayImpl` (leitura e ciclo de vida da conta).
 */
export interface AuthGateway {
  getAccountByUserId(userId: number): Promise<AuthAccountData | null>;

  activateAccount(userId: number): Promise<void>;

  deactivateAccount(userId: number): Promise<void>;

  deleteAccount(userId: number): Promise<void>;
}
