import type { EnvVars } from "./env";

export type AppEnvironment = "development" | "test" | "production";

export interface AppConfig {
  env: AppEnvironment;
  name: string;
  version: string;
  url: string;
  port: number;
  host: string;
  shutdownTimeoutMs: number;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
}

/**
 * BOOT-001 — ambiente, host, porta e encerramento.
 *
 * `synchronize` é SEMPRE `false` (nunca exposto aqui): o esquema
 * é gerido exclusivamente por migrações — a sincronização
 * automática está proibida em produção.
 */
export function createAppConfig(env: Pick<EnvVars,
  | "NODE_ENV"
  | "APP_NAME"
  | "APP_VERSION"
  | "APP_URL"
  | "PORT"
  | "HOST"
  | "SHUTDOWN_TIMEOUT_MS">): AppConfig {
  return {
    env: env.NODE_ENV,
    name: env.APP_NAME,
    version: env.APP_VERSION,
    url: env.APP_URL,
    port: env.PORT,
    host: env.HOST,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    isProduction: env.NODE_ENV === "production",
    isDevelopment: env.NODE_ENV === "development",
    isTest: env.NODE_ENV === "test",
  };
}
