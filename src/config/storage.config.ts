import type { EnvVars } from "./env";

export type StorageDriver = "local" | "s3";

export interface StorageConfig {
  driver: StorageDriver;
  dir: string;
  s3: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  maxFileMb: number;
}

/**
 * Armazenamento de ficheiros: `local` por omissão (uploads na
 * máquina/contentor), `s3` quando configurado. Sem ligações —
 * o adaptador de infraestrutura consome estas opções.
 */
export function createStorageConfig(env: Pick<EnvVars,
  | "STORAGE_DRIVER"
  | "STORAGE_DIR"
  | "STORAGE_BUCKET"
  | "STORAGE_REGION"
  | "STORAGE_ACCESS_KEY"
  | "STORAGE_SECRET_KEY"
  | "STORAGE_MAX_FILE_MB">): StorageConfig {
  return {
    driver: env.STORAGE_DRIVER,
    dir: env.STORAGE_DIR,
    s3: {
      bucket: env.STORAGE_BUCKET,
      region: env.STORAGE_REGION,
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
    },
    maxFileMb: env.STORAGE_MAX_FILE_MB,
  };
}
