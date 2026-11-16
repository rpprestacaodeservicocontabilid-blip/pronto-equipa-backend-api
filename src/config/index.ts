/**
 * ============================================================
 * COMPOSIÇÃO CENTRAL DA CONFIGURAÇÃO (Módulo 02)
 * ============================================================
 *
 * `createConfig()` valida o ambiente UMA vez (Zod + regras de
 * produção) e deriva todos os sub-objetos tipados. Não estabelece
 * nenhuma ligação real — quem liga são os adaptadores de
 * infraestrutura (`infra/`, `shared/infrastructure`).
 *
 * O bootstrap consome `createConfig()`; o objeto legado `ENV`
 * (`config/env`) mantém-se para os módulos existentes.
 */

import { createAppConfig, type AppConfig } from './app.config';
import { createAuthConfig, type AuthConfig } from './auth.config';
import { createCorsConfig, type CorsConfig } from './cors.config';
import { createDatabaseConfig, type DatabaseConfig } from './database.config';
import { createEmailConfig, type EmailConfig } from './email.config';
import { createLoggerConfig, type LoggerConfig } from './logger.config';
import { createQueueConfig, type QueueConfig } from './queue.config';
import { createRedisConfig, type RedisConfig } from './redis.config';
import { createStorageConfig, type StorageConfig } from './storage.config';
import { createTelemetryConfig, type TelemetryConfig } from './telemetry.config';
import { validateEnv, type EnvVars } from './env';

export interface AppConfigRoot {
  /** Variáveis validadas (fonte de verdade). */
  env: EnvVars;
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  auth: AuthConfig;
  cors: CorsConfig;
  queue: QueueConfig;
  storage: StorageConfig;
  logger: LoggerConfig;
  email: EmailConfig;
  telemetry: TelemetryConfig;
}

/**
 * Valida o ambiente e compõe toda a configuração.
 *
 * Lança `[config] invalid environment: ...` quando o esquema
 * falha ou quando produção não cumpre as regras (JWT forte,
 * MySQL com credenciais, CORS explícito).
 */
export function createConfig(values: NodeJS.ProcessEnv = process.env): AppConfigRoot {
  const env = validateEnv(values);

  return {
    env,
    app: createAppConfig(env),
    database: createDatabaseConfig(env),
    redis: createRedisConfig(env),
    auth: createAuthConfig(env),
    cors: createCorsConfig(env),
    queue: createQueueConfig(env),
    storage: createStorageConfig(env),
    logger: createLoggerConfig(env),
    email: createEmailConfig(env),
    telemetry: createTelemetryConfig(env),
  };
}

export { validateEnv, loadEnv, assertProductionReady, envSchema } from './env';
export type { EnvVars } from './env';

// Fábricas individuais (úteis para testes e composição parcial).
export { createAppConfig } from './app.config';
export { createDatabaseConfig } from './database.config';
export { createRedisConfig } from './redis.config';
export { createAuthConfig } from './auth.config';
export { createCorsConfig } from './cors.config';
export { createQueueConfig } from './queue.config';
export { createStorageConfig } from './storage.config';
export { createLoggerConfig, SENSITIVE_FIELDS } from './logger.config';
export { createEmailConfig } from './email.config';
export { createTelemetryConfig } from './telemetry.config';
export { parseOrigins } from './env';
export type { AppConfig, AppEnvironment } from './app.config';
export type { DatabaseConfig, DatabaseDialect } from './database.config';
export type { RedisConfig } from './redis.config';
export type { AuthConfig } from './auth.config';
export type { CorsConfig } from './cors.config';
export type { QueueConfig } from './queue.config';
export type { StorageConfig, StorageDriver } from './storage.config';
export type { LoggerConfig, LogLevel } from './logger.config';
export type { EmailConfig } from './email.config';
export type { TelemetryConfig } from './telemetry.config';
