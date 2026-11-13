import dotenv from 'dotenv';
import path from 'path';

type EnvType = 'development' | 'test' | 'production';

const NODE_ENV = (process.env.NODE_ENV as EnvType) || 'development';

// ======================================================
// LOAD BASE ENV
// ======================================================

dotenv.config({
  path: path.resolve(process.cwd(), 'src/config/env/base.env'),
});

// ======================================================
// LOAD ENVIRONMENT FILE
// ======================================================

dotenv.config({
  path: path.resolve(process.cwd(), `src/config/env/${NODE_ENV}.env`),
  override: true,
});

// ======================================================
// HELPERS
// ======================================================

const toNumber = (value: any, fallback: number) => (value ? Number(value) : fallback);

// ======================================================
// ENV OBJECT
// ======================================================

export const ENV = {
  NODE_ENV,

  APP: {
    NAME: process.env.APP_NAME!,
    PORT: toNumber(process.env.APP_PORT, 3001),
    FRONTEND_URL:
      process.env.FRONTEND_URL ||
      process.env.CORS_ORIGIN ||
      'http://localhost:3333',
  },

  DB: {
    DIALECT: process.env.DB_DIALECT!,
    HOST: process.env.DB_HOST || '',
    PORT: toNumber(process.env.DB_PORT, 0),
    NAME: process.env.DB_NAME || '',
    USER: process.env.DB_USER || '',
    PASSWORD: process.env.DB_PASSWORD || '',
    STORAGE: process.env.DB_STORAGE || './dev.sqlite',
  },

  REDIS: {
    URL: process.env.REDIS_URL!,
    PASSWORD: process.env.REDIS_PASSWORD!,
  },

  RABBITMQ: {
    URL: process.env.RABBITMQ_URL!,
  },

  JWT: {
    SECRET: process.env.JWT_SECRET!,
    EXPIRES_IN: process.env.JWT_EXPIRES_IN!,
  },

  GOOGLE: {
    CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
    CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
    REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || "",
  },

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  FLAGS: {
    isDev: NODE_ENV === 'development',
    isTest: NODE_ENV === 'test',
    isProd: NODE_ENV === 'production',
  },
};

// ======================================================
// MÓDULO 02 — VALIDAÇÃO COM ZOD
// ======================================================
//
// O objeto `ENV` acima é a API legada (mantida intacta para
// não quebrar os módulos existentes). As funções abaixo são a
// fonte única de VERDADE validada: o bootstrap e todos os
// módulos de configuração (`src/config/*.config.ts`) derivam
// daqui. Nenhuma variável obrigatória tem omissão — em
// produção use um gestor de segredos para a injetar.

import { z } from "zod";

const bool = z.enum(["true", "false"]);

export const envSchema = z.object({
  // -------------------------------------------------------
  // APP
  // -------------------------------------------------------
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().min(1).default("prontoequipas"),
  APP_VERSION: z.string().min(1).default("1.0.0"),
  APP_URL: z.string().default(""),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  // 0.0.0.0 (e não 127.0.0.1) para ser alcançável de fora do
  // contentor Docker através do mapeamento de portas.
  HOST: z.string().min(1).default("0.0.0.0"),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

  // -------------------------------------------------------
  // CORS
  // -------------------------------------------------------
  FRONTEND_URL: z.string().default(""),
  CORS_ORIGIN: z.string().default(""),

  // -------------------------------------------------------
  // AUTH (segredos sem omissão)
  // -------------------------------------------------------
  JWT_SECRET: z.string().min(1, "JWT_SECRET must not be empty"),
  JWT_EXPIRES_IN: z.string().min(1).default("24h"),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default("7d"),
  JWT_ALGORITHM: z.string().min(1).default("HS256"),
  JWT_ISSUER: z.string().min(1).default("prontoequipas"),
  JWT_AUDIENCE: z.string().min(1).default("prontoequipas-app"),

  // -------------------------------------------------------
  // DATABASE (SQLite em dev/test, MySQL 8 em produção)
  // -------------------------------------------------------
  DB_DIALECT: z.string().min(1).default("sqlite"),
  DB_HOST: z.string().default(""),
  DB_PORT: z.coerce.number().int().min(0).max(65535).default(0),
  DB_NAME: z.string().default(""),
  DB_USER: z.string().default(""),
  DB_PASSWORD: z.string().default(""),
  DB_STORAGE: z.string().default("./dev.sqlite"),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_POOL_MIN: z.coerce.number().int().min(0).default(0),
  DB_POOL_ACQUIRE: z.coerce.number().int().positive().default(30000),
  DB_POOL_IDLE: z.coerce.number().int().positive().default(10000),
  DB_SSL: bool.default("false"),
  DB_SSL_REJECT_UNAUTHORIZED: bool.default("true"),
  // AES-256-GCM key for bank account and beneficiary identifiers (64 hex characters).
  PAYMENTS_PII_ENCRYPTION_KEY: z.string().regex(/^$|^[a-fA-F0-9]{64}$/).default(""),

  // -------------------------------------------------------
  // REDIS (opcional — degrada para memória)
  // -------------------------------------------------------
  REDIS_URL: z.string().default(""),
  REDIS_PASSWORD: z.string().default(""),
  REDIS_PREFIX: z.string().min(1).default("prontoequipas:"),

  // -------------------------------------------------------
  // QUEUE (RabbitMQ opcional — degrada para desligado)
  // -------------------------------------------------------
  RABBITMQ_URL: z.string().default(""),
  RABBITMQ_PREFETCH: z.coerce.number().int().positive().default(10),
  QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(5),
  QUEUE_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  QUEUE_BACKOFF_MS: z.coerce.number().int().positive().default(5000),

  // -------------------------------------------------------
  // STORAGE
  // -------------------------------------------------------
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_DIR: z.string().min(1).default("./uploads"),
  STORAGE_BUCKET: z.string().default(""),
  STORAGE_REGION: z.string().default(""),
  STORAGE_ACCESS_KEY: z.string().default(""),
  STORAGE_SECRET_KEY: z.string().default(""),
  STORAGE_MAX_FILE_MB: z.coerce.number().int().positive().default(10),

  // -------------------------------------------------------
  // LOGGER
  // -------------------------------------------------------
  LOG_LEVEL: z.string().min(1).default("info"),
  LOG_DIR: z.string().min(1).default("logs"),
  LOG_MAX_SIZE_MB: z.coerce.number().int().positive().default(10),
  LOG_MAX_FILES: z.coerce.number().int().positive().default(5),

  // -------------------------------------------------------
  // EMAIL / NOTIFICAÇÕES
  // -------------------------------------------------------
  EMAIL_PROVIDER_URL: z.string().default(""),
  EMAIL_API_KEY: z.string().default(""),
  EMAIL_FROM_NAME: z.string().min(1).default("ProntoEquipas"),
  EMAIL_FROM_ADDRESS: z.string().min(1).default("noreply@prontoequipas.com"),
  AUTH_EMAIL_PROVIDER_URL: z.string().default(""),
  AUTH_SMS_PROVIDER_URL: z.string().default(""),
  AUTH_NOTIFICATION_API_KEY: z.string().default(""),

  // -------------------------------------------------------
  // TELEMETRIA (sem dependências novas — só configuração)
  // -------------------------------------------------------
  TELEMETRY_ENABLED: bool.default("false"),
  TELEMETRY_ENDPOINT: z.string().default(""),
  TELEMETRY_TRACE_HEADER: z.string().min(1).default("traceparent"),
});

export type EnvVars = z.infer<typeof envSchema>;

/** Parsing estrito. Lança `ZodError` com todos os problemas. */
export function loadEnv(values: NodeJS.ProcessEnv = process.env): EnvVars {
  return envSchema.parse(values);
}

/** Divide uma lista separada por vírgulas em origens limpas. */
export function parseOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Valores inseguros conhecidos (placeholders de exemplos e
 * ficheiros `.env.example`) que nunca podem ir a produção.
 */
const WEAK_SECRETS = new Set([
  "secret",
  "changeme",
  "change-me",
  "your-secret-key",
  "your-secret-key-here-change-in-production",
  "your-secure-jwt-secret-change-in-production-12345",
]);

/**
 * Regras obrigatórias de produção (BOOT-001).
 *
 * A aplicação FALHA ANTES de abrir qualquer recurso quando o
 * ambiente de produção está incompleto ou inseguro — em vez de
 * arrancar com segredos vazios ou base de dados local.
 */
export function assertProductionReady(env: EnvVars): void {
  if (env.NODE_ENV !== "production") return;

  const problems: string[] = [];

  // Segredo forte.
  if (
    env.JWT_SECRET.length < 32 ||
    WEAK_SECRETS.has(env.JWT_SECRET)
  ) {
    problems.push(
      "JWT_SECRET must be at least 32 characters and not a placeholder value",
    );
  }

  // MySQL 8 com credenciais completas (decisão de stack).
  if (env.DB_DIALECT !== "mysql") {
    problems.push('DB_DIALECT must be "mysql" in production');
  } else {
    if (!env.DB_HOST) problems.push("DB_HOST is required in production");
    if (!env.DB_PORT) problems.push("DB_PORT is required in production");
    if (!env.DB_NAME) problems.push("DB_NAME is required in production");
    if (!env.DB_USER) problems.push("DB_USER is required in production");
    if (!env.DB_PASSWORD) {
      problems.push("DB_PASSWORD is required in production");
    }
  }

  if (!/^[a-fA-F0-9]{64}$/.test(env.PAYMENTS_PII_ENCRYPTION_KEY)) {
    problems.push("PAYMENTS_PII_ENCRYPTION_KEY must be a 32-byte hexadecimal secret in production");
  }

  if (problems.length > 0) {
    throw new Error(
      `[config] production configuration invalid:\n - ${problems.join("\n - ")}`,
    );
  }
}

/**
 * Valida o ambiente completo (esquema + regras de produção).
 * Envolve o erro de forma controlada (BOOT-001).
 */
export function validateEnv(
  values: NodeJS.ProcessEnv = process.env,
): EnvVars {
  try {
    const env = loadEnv(values);
    assertProductionReady(env);
    return env;
  } catch (error) {
    throw new Error(
      `[config] invalid environment: ${(error as Error).message}`,
    );
  }
}
