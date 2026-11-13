import 'express';

/**
 * Contexto do utilizador autenticado populado pelo
 * `authenticationMiddleware` (módulo auth) a partir do JWT + sessão.
 */
export interface AuthenticatedUser {
  userId: number;
  accountId: number;
  sessionId: number;
  roles: string[];
  permissions: string[];
}

declare module 'express-serve-static-core' {
  interface Request {
    cityId?: number;

    /** Presente apenas em rotas autenticadas com sucesso. */
    user?: AuthenticatedUser;
  }
}
