import type { EnvVars } from "./env";

export type LogLevel = "error" | "warn" | "info" | "http" | "debug";

export interface LoggerConfig {
  level: LogLevel;
  dir: string;
  maxFileSizeBytes: number;
  maxFiles: number;
}

const LOG_LEVELS = new Set(["error", "warn", "info", "http", "debug"]);

/**
 * Campos cujo valor NUNCA pode aparecer em logs, mesmo que a
 * mensagem os contenha. Usado pelo Winston (`config/logger.ts`)
 * para redacção automática — qualquer campo novo sensível
 * (segredos, tokens, moradas) deve ser acrescentado aqui.
 */
export const SENSITIVE_FIELDS: readonly string[] = [
  "password",
  "passwordHash",
  "password_hash",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "jwt",
  "secret",
  "clientSecret",
  "apiKey",
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "creditCard",
  "cardNumber",
  "iban",
  "nif",
];

export function createLoggerConfig(
  env: Pick<EnvVars, "LOG_LEVEL" | "LOG_DIR" | "LOG_MAX_SIZE_MB" | "LOG_MAX_FILES">,
): LoggerConfig {
  const level = LOG_LEVELS.has(env.LOG_LEVEL)
    ? (env.LOG_LEVEL as LogLevel)
    : "info";

  return {
    level,
    dir: env.LOG_DIR,
    maxFileSizeBytes: env.LOG_MAX_SIZE_MB * 1024 * 1024,
    maxFiles: env.LOG_MAX_FILES,
  };
}
