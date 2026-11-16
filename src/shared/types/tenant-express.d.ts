import type { TenantContext } from './index';

declare global {
  namespace Express {
    interface Request {
      /**
       * Contexto de empresa (tenant) resolvido pelos middlewares de
       * `authorization`. Só existe nas rotas `/api/v1/company/*` após
       * validação de membership activa.
       */
      tenant?: TenantContext;
    }
  }
}

export {};
