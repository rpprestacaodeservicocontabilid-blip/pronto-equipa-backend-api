/**
 * ============================================================
 * SHARED MODULE — Módulo 03 (shared)
 * ============================================================
 *
 * Módulo da FUNDACÇÃO registado no bootstrap pela fase
 * `register(container)`:
 *
 *   - não é módulo de negócio (o bootstrap não conhece
 *     repositórios nem módulos de RH);
 *   - não abre ligações no `init` — os adaptadores são
 *     criados de forma lazy pelo contentor;
 *   - todos os serviços são substituíveis por token nos
 *     testes (`container.register(token, fake)`).
 *
 * Ordem: registado PRIMEIRO em `defaultModules()` para que
 * qualquer módulo posterior possa resolver os tokens.
 */

import type { Container } from "../bootstrap/container";
import type { ModuleDefinition } from "../bootstrap/types/application-context";
import type { Clock } from "./application/clock";
import type { IdempotencyStore } from "./application/idempotency";
import type { TransactionManager } from "./application/transaction-manager";
import { SystemClock } from "./application/clock";
import { InMemoryIdempotencyStore } from "./infrastructure/in-memory-idempotency-store";
import { SequelizeTransactionManager } from "./infrastructure/sequelize-transaction-manager";
import type { Telemetry } from "./infrastructure/telemetry";
import { NoopTelemetry } from "./infrastructure/telemetry";
import { SHARED_TOKENS } from "./tokens";

export function sharedModule(): ModuleDefinition {
  return {
    name: "shared",

    register(container: Container): void {
      container.register<Clock>(SHARED_TOKENS.CLOCK, () => new SystemClock());

      container.register<TransactionManager>(
        SHARED_TOKENS.TRANSACTION_MANAGER,
        () => new SequelizeTransactionManager(),
      );

      container.register<IdempotencyStore>(
        SHARED_TOKENS.IDEMPOTENCY_STORE,
        () => new InMemoryIdempotencyStore(),
      );

      container.register<Telemetry>(
        SHARED_TOKENS.TELEMETRY,
        () => new NoopTelemetry(),
      );
    },

    init(context) {
      // Sem ligações a abrir: os adaptadores são lazy.
      context.logger.info("[bootstrap] shared services registered");
      context.health.set("shared", "up", true);
    },

    shutdown(context) {
      context.health.set("shared", "down", true);
    },
  };
}
