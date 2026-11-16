export interface UserGateway {
  /**
   * Procura um utilizador pelo ID.
   */
  findById(userId: number): Promise<AuthUserData | null>;

  /**
   * Procura um utilizador pelo email.
   */
  findByEmail(email: string): Promise<AuthUserData | null>;

  /**
   * Procura um utilizador pelo telefone.
   */
  findByPhone(phone: string): Promise<AuthUserData | null>;

  /**
   * Cria um novo utilizador.
   *
   * O ID é gerado pelo sistema/banco de dados.
   */
  createUser(input: CreateAuthUserInput): Promise<AuthUserData>;

  /**
   * Atualiza o email de um utilizador.
   */
  updateEmail(userId: number, email: string): Promise<void>;
}

/**
 * Dados mínimos do utilizador que o módulo
 * de autenticação precisa conhecer.
 *
 * O Auth não deve depender diretamente
 * da entidade User.
 */
export interface AuthUserData {
  id: number;

  name: string;

  email: string;

  phone: string | null;

  active: boolean;
}

/**
 * Dados necessários para criar um User
 * durante o processo de autenticação/registro.
 */
export interface CreateAuthUserInput {
  name: string;

  email: string;

  phone?: string | null;

  termsAcceptedAt?: Date | null;

  userType?: string;
}
