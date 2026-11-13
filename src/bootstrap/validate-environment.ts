/**
 * ============================================================
 * VALIDAÇÃO DE AMBIENTE (BOOT-001)
 * ============================================================
 *
 * Nenhuma dependência é aberta antes de o ambiente estar
 * validado.
 *
 * MÓDULO 02 — a fonte única de verdade é o esquema Zod em
 * `src/config/env.ts`: este ficheiro apenas DELEGA (schema +
 * regras de produção) e projeta o resultado no `BootstrapConfig`
 * que o bootstrap consome. Não existe um segundo esquema.
 *
 * Segredos são sempre obrigatórios e nunca têm omissão — em
 * produção use um gestor de segredos para os injetar.
 */

import { assertProductionReady, loadEnv } from "../config/env";

import type { EnvVars } from "../config/env";
import type { BootstrapConfig } from "./types/application-context";

/** Ambiente validado completo (esquema de `config/env`). */
export type BootstrapEnvironment = EnvVars;

/** Parsing estrito. Lança `ZodError` com todos os problemas. */
export function loadEnvironment(
  values: NodeJS.ProcessEnv = process.env,
): BootstrapEnvironment {
  return loadEnv(values);
}

/**
 * Valida o ambiente (esquema + regras de produção) e devolve a
 * configuração tipada do bootstrap.
 *
 * Envolve o erro de forma controlada (BOOT-001): a aplicação
 * falha ANTES de tocar em qualquer recurso, com mensagem clara.
 */
export function validateEnvironment(
  values: NodeJS.ProcessEnv = process.env,
): BootstrapConfig {
  try {
    const env = loadEnv(values);
    assertProductionReady(env);

    return {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      host: env.HOST,
      jwtSecret: env.JWT_SECRET,
      shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    };
  } catch (error) {
    throw new Error(
      `[bootstrap] invalid environment: ${(error as Error).message}`,
    );
  }
}
