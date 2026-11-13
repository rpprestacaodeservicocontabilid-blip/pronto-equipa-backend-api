import type { EnvVars } from "./env";

export type DatabaseDialect = "sqlite" | "mysql";

export interface DatabaseConfig {
  dialect: DatabaseDialect;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  storage?: string;
  pool: {
    max: number;
    min: number;
    acquire: number;
    idle: number;
  };
  ssl: {
    enabled: boolean;
    rejectUnauthorized: boolean;
  };
  /**
   * NUNCA `true`. A aplicação só arranca em produção com
   * `DB_DIALECT=mysql` (ver `assertProductionReady`) e o esquema
   * só muda via migrações.
   */
  synchronize: false;
}

/**
 * Configuração do banco de dados.
 *
 * SQLite em desenvolvimento/teste (ficheiro local) e MySQL 8 em
 * produção — decisão de stack do projecto. Este módulo apenas
 * DERIVA as opções: quem liga é o adaptador em
 * `infra/database`.
 */
export function createDatabaseConfig(env: Pick<EnvVars,
  | "DB_DIALECT"
  | "DB_HOST"
  | "DB_PORT"
  | "DB_NAME"
  | "DB_USER"
  | "DB_PASSWORD"
  | "DB_STORAGE"
  | "DB_POOL_MAX"
  | "DB_POOL_MIN"
  | "DB_POOL_ACQUIRE"
  | "DB_POOL_IDLE"
  | "DB_SSL"
  | "DB_SSL_REJECT_UNAUTHORIZED">): DatabaseConfig {
  const dialect = (env.DB_DIALECT === "mysql" ? "mysql" : "sqlite");

  return {
    dialect,
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    ...(dialect === "sqlite" ? { storage: env.DB_STORAGE } : {}),
    pool: {
      max: env.DB_POOL_MAX,
      min: env.DB_POOL_MIN,
      acquire: env.DB_POOL_ACQUIRE,
      idle: env.DB_POOL_IDLE,
    },
    ssl: {
      enabled: env.DB_SSL === "true",
      rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED === "true",
    },
    synchronize: false,
  };
}
