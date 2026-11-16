import type { EnvVars } from './env';

export interface AuthConfig {
  jwt: {
    secret: string;
    algorithm: string;
    issuer: string;
    audience: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
}

/**
 * Parâmetros JWT.
 *
 * `secret` vem do esquema Zod SEM omissão e passa pelas regras
 * de produção (`assertProductionReady`: ≥32 caracteres e nunca
 * um placeholder). Este módulo não gera nem valida segredos —
 * apenas os expõe tipados para os módulos de identidade.
 */
export function createAuthConfig(
  env: Pick<
    EnvVars,
    | 'JWT_SECRET'
    | 'JWT_EXPIRES_IN'
    | 'JWT_REFRESH_EXPIRES_IN'
    | 'JWT_ALGORITHM'
    | 'JWT_ISSUER'
    | 'JWT_AUDIENCE'
  >,
): AuthConfig {
  return {
    jwt: {
      secret: env.JWT_SECRET,
      algorithm: env.JWT_ALGORITHM,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      expiresIn: env.JWT_EXPIRES_IN,
      refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    },
  };
}
