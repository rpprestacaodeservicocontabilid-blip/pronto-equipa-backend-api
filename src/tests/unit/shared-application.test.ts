/**
 * Módulo 03 — shared/application + shared/infrastructure
 *
 * Result, Pagination, Clock, IdempotencyStore, Telemetry,
 * TransactionManager (fake + Sequelize) e contexto de tenant.
 */

import { FixedClock, SystemClock } from "../../shared/application/clock";
import { MAX_LIMIT, Pagination } from "../../shared/application/pagination";
import type { PaginationInput } from "../../shared/application/pagination";
import { Result } from "../../shared/application/result";
import type {
  TransactionManager,
  TransactionOptions,
  TransactionScope,
} from "../../shared/application/transaction-manager";
import { DomainError } from "../../shared/domain/domain-error";
import { InMemoryIdempotencyStore } from "../../shared/infrastructure/in-memory-idempotency-store";
import { SequelizeTransactionManager } from "../../shared/infrastructure/sequelize-transaction-manager";
import { NoopTelemetry } from "../../shared/infrastructure/telemetry";
import {
  currentTenantId,
  runWithTenant,
} from "../../shared/infrastructure/tenant-context";

// ============================================================
// RESULT
// ============================================================

describe("shared/application — Result", () => {
  test("ok cria um resultado de sucesso", () => {
    const result = Result.ok(42);

    expect(result.isOk).toBe(true);
    expect(result.isFail).toBe(false);
    expect(result.value).toBe(42);
    expect(result.unwrap()).toBe(42);
  });

  test("fail cria um resultado de falha", () => {
    const error = new DomainError("Regra violada", "RULE_BROKEN");
    const result = Result.fail(error);

    expect(result.isFail).toBe(true);
    expect(result.isOk).toBe(false);
    expect(result.error).toBe(error);
    expect(result.unwrapError()).toBe(error);
  });

  test("value lança em falha e error lança em sucesso", () => {
    expect(() => Result.fail("erro").unwrap()).toThrow(/no value on failure/);
    expect(() => Result.ok(1).error).toThrow(/no error on success/);
  });

  test("fail exige um erro", () => {
    expect(() => Result.fail(undefined)).toThrow(/requires an error/);
  });

  test("unwrapOr devolve o valor ou o padrão", () => {
    const failed: Result<number, string> = Result.fail("x");

    expect(Result.ok("a").unwrapOr("b")).toBe("a");
    expect(failed.unwrapOr(0)).toBe(0);
  });

  test("map transforma o valor mantendo o sucesso", () => {
    const result = Result.ok(2).map((value) => value * 10);

    expect(result.isOk).toBe(true);
    expect(result.value).toBe(20);
  });

  test("map propaga a falha sem executar", () => {
    let called = false;
    const result = Result.fail("boom")
      .map(() => {
        called = true;
        return 1;
      });

    expect(result.isFail).toBe(true);
    expect(called).toBe(false);
  });

  test("mapError transforma o erro", () => {
    const result = Result.fail("boom").mapError(
      (error) => new DomainError(error, "MAPPED"),
    );

    expect(result.isFail).toBe(true);
    expect((result.error as DomainError).code).toBe("MAPPED");
  });

  test("flatMap encadeia resultados", () => {
    const ok = Result.ok(2).flatMap((value) => Result.ok(value + 1));

    const failing: Result<number, string> = Result.fail("boom");
    const fail = failing.flatMap((value) => Result.ok(value + 1));

    expect(ok.value).toBe(3);
    expect(fail.isFail).toBe(true);
  });

  test("match cobre os dois ramos", () => {
    const text = (result: Result<number, string>): string =>
      result.match({ ok: (value) => `ok:${value}`, fail: (error) => `fail:${error}` });

    expect(text(Result.ok(1))).toBe("ok:1");
    expect(text(Result.fail("x"))).toBe("fail:x");
  });

  test("tryCatch captura excepções como falha", () => {
    expect(Result.tryCatch(() => 1).isOk).toBe(true);

    const failed = Result.tryCatch<number>(() => {
      throw new Error("explode");
    });

    expect(failed.isFail).toBe(true);
    expect((failed.error as Error).message).toBe("explode");
  });

  test("tryCatchAsync captura rejeições como falha", async () => {
    const failed = await Result.tryCatchAsync<number>(async () => {
      throw new Error("async boom");
    });

    expect(failed.isFail).toBe(true);
    expect((failed.error as Error).message).toBe("async boom");

    const ok = await Result.tryCatchAsync(async () => "valor");
    expect(ok.value).toBe("valor");
  });
});

// ============================================================
// PAGINATION
// ============================================================

describe("shared/application — Pagination", () => {
  test("aplica valores por omissão", () => {
    const pagination = Pagination.from();

    expect(pagination.page).toBe(1);
    expect(pagination.limit).toBe(10);
    expect(pagination.offset).toBe(0);
  });

  test("normaliza strings vindas da query string", () => {
    const pagination = Pagination.from({ page: "3", limit: "25" });

    expect(pagination.page).toBe(3);
    expect(pagination.limit).toBe(25);
    expect(pagination.offset).toBe(50);
  });

  test("aceita null/undefined e usa os defaults", () => {
    const pagination = Pagination.from({ page: null, limit: undefined });

    expect(pagination.page).toBe(1);
    expect(pagination.limit).toBe(10);
  });

  test("aceita os limites extremos (1 e MAX_LIMIT)", () => {
    expect(Pagination.from({ page: 1, limit: 1 }).limit).toBe(1);
    expect(Pagination.from({ page: 1, limit: MAX_LIMIT }).limit).toBe(MAX_LIMIT);
  });

  const invalidInputs: Array<[string, PaginationInput]> = [
    ["page inválido", { page: "abc" }],
    ["page zero", { page: 0 }],
    ["page negativo", { page: -1 }],
    ["page fraccionário", { page: 1.5 }],
    ["limit inválido", { limit: "dez" }],
    ["limit zero", { limit: 0 }],
    ["limit acima do máximo", { limit: MAX_LIMIT + 1 }],
  ];

  test.each(invalidInputs)(
    "rejeita %s com DomainError",
    (_label, input) => {
      expect(() => Pagination.from(input)).toThrow(DomainError);

      try {
        Pagination.from(input);
      } catch (error) {
        expect((error as DomainError).code).toBe("INVALID_PAGINATION");
      }
    },
  );

  test("totais e resultado paginado", () => {
    const pagination = Pagination.from({ page: 2, limit: 10 });

    expect(pagination.total(0)).toBe(0);
    expect(pagination.total(95)).toBe(10);

    const result = pagination.toResult(["b"], 95);

    expect(result).toEqual({
      data: ["b"],
      total: 95,
      page: 2,
      limit: 10,
      totalPages: 10,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  test("última página não tem próxima", () => {
    const result = Pagination.from({ page: 10, limit: 10 }).toResult([], 95);

    expect(result.hasNextPage).toBe(false);
    expect(result.hasPreviousPage).toBe(true);
  });

  test("total negativo é rejeitado", () => {
    expect(() => Pagination.of(1, 10).total(-1)).toThrow(DomainError);
  });

  test("é um ValueObject: igualdade por valores", () => {
    expect(
      Pagination.from({ page: "2", limit: "5" }).equals(Pagination.of(2, 5)),
    ).toBe(true);
    expect(Pagination.of(2, 5).equals(Pagination.of(3, 5))).toBe(false);
  });
});

// ============================================================
// CLOCK
// ============================================================

describe("shared/application — Clock", () => {
  test("SystemClock devolve o instante actual", () => {
    const before = Date.now();
    const now = new SystemClock().now();

    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("FixedClock avança e devolve cópias imutáveis", () => {
    const clock = new FixedClock("2026-01-01T00:00:00.000Z");

    const first = clock.now();
    first.setTime(0); // não deve afectar o relógio

    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");

    clock.advance(60_000);

    expect(clock.now().toISOString()).toBe("2026-01-01T00:01:00.000Z");

    clock.set("2026-06-15T12:00:00.000Z");

    expect(clock.now().toISOString()).toBe("2026-06-15T12:00:00.000Z");
  });
});

// ============================================================
// IDEMPOTENCY (in-memory)
// ============================================================

describe("shared/infrastructure — InMemoryIdempotencyStore", () => {
  test("claim é verdadeiro na primeira vez e falso nas seguintes", async () => {
    const store = new InMemoryIdempotencyStore();

    expect(await store.claim("key-1")).toBe(true);
    expect(await store.claim("key-1")).toBe(false);
  });

  test("complete guarda a resposta para reemissão", async () => {
    const store = new InMemoryIdempotencyStore();

    await store.claim("key-2");
    await store.complete("key-2", { id: 99 });

    const entry = await store.find<{ id: number }>("key-2");

    expect(entry?.status).toBe("completed");
    expect(entry?.response).toEqual({ id: 99 });

    // Chave activa: novo claim é recusado (reemissão via find).
    expect(await store.claim("key-2")).toBe(false);
  });

  test("release liberta a chave para nova tentativa", async () => {
    const store = new InMemoryIdempotencyStore();

    await store.claim("key-3");
    await store.release("key-3");

    expect(await store.find("key-3")).toBeNull();
    expect(await store.claim("key-3")).toBe(true);
  });

  test("entradas expiram e voltam a ser reclamáveis", async () => {
    const store = new InMemoryIdempotencyStore();

    await store.claim("key-4", 5);
    expect(await store.claim("key-4")).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await store.find("key-4")).toBeNull();
    expect(await store.claim("key-4")).toBe(true);
  });

  test("find devolve null para chave inexistente", async () => {
    const store = new InMemoryIdempotencyStore();

    expect(await store.find("missing")).toBeNull();
  });
});

// ============================================================
// TELEMETRY
// ============================================================

describe("shared/infrastructure — NoopTelemetry", () => {
  test("métricas não lançam nem alteram o comportamento", async () => {
    const telemetry = new NoopTelemetry();

    expect(() => telemetry.increment("counter")).not.toThrow();
    expect(() => telemetry.observe("hist", 12)).not.toThrow();
    expect(() => telemetry.recordError(new Error("x"))).not.toThrow();
    await expect(telemetry.withSpan("span", () => "ok")).resolves.toBe("ok");
  });

  test("withSpan propaga erros", async () => {
    const telemetry = new NoopTelemetry();

    await expect(
      telemetry.withSpan("span", () => {
        throw new Error("span boom");
      }),
    ).rejects.toThrow("span boom");
  });
});

// ============================================================
// TENANT CONTEXT (AsyncLocalStorage)
// ============================================================

describe("shared/infrastructure — tenant context", () => {
  test("activa o tenant dentro do fluxo e limpa fora dele", () => {
    expect(currentTenantId()).toBeNull();

    runWithTenant(7, () => {
      expect(currentTenantId()).toBe(7);
    });

    expect(currentTenantId()).toBeNull();
  });

  test("fluxos aninhados mantêm o tenant mais interno", () => {
    runWithTenant(1, () => {
      runWithTenant(2, () => {
        expect(currentTenantId()).toBe(2);
      });

      expect(currentTenantId()).toBe(1);
    });
  });

  test("tenant null representa o contexto global", () => {
    runWithTenant(null, () => {
      expect(currentTenantId()).toBeNull();
    });
  });
});

// ============================================================
// TRANSACTION MANAGER (contrato + fake)
// ============================================================

class FakeTransactionManager implements TransactionManager<{ seq: number }> {
  public readonly options: TransactionOptions[] = [];

  public async run<T>(
    callback: (handle: { seq: number }, scope: TransactionScope) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    this.options.push(options);

    return callback(
      { seq: 1 },
      { tenantId: options.tenantId ?? null },
    );
  }
}

describe("shared/application — TransactionManager (fake)", () => {
  test("entrega handle e scope ao callback", async () => {
    const manager = new FakeTransactionManager();

    const outcome = await manager.run(
      async (tx, scope) => ({ tx, scope }),
      { tenantId: 5 },
    );

    expect(outcome.tx).toEqual({ seq: 1 });
    expect(outcome.scope.tenantId).toBe(5);
    expect(manager.options).toEqual([{ tenantId: 5 }]);
  });

  test("propaga o erro do callback (rollback)", async () => {
    const manager = new FakeTransactionManager();

    await expect(
      manager.run(async () => {
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
  });
});

// ============================================================
// TRANSACTION MANAGER (Sequelize real, sem queries)
// ============================================================

describe("shared/infrastructure — SequelizeTransactionManager", () => {
  test("executa com tenant activo dentro da transacção", async () => {
    const manager = new SequelizeTransactionManager();

    const outcome = await manager.run(
      async (transaction, scope) => {
        expect(transaction).toBeDefined();
        expect(scope.tenantId).toBe(11);
        expect(currentTenantId()).toBe(11);

        return "done";
      },
      { tenantId: 11 },
    );

    expect(outcome).toBe("done");
    expect(currentTenantId()).toBeNull();
  });

  test("sem tenant o contexto é global (null)", async () => {
    const manager = new SequelizeTransactionManager();

    await manager.run(async (_transaction, scope) => {
      expect(scope.tenantId).toBeNull();
      expect(currentTenantId()).toBeNull();
    });
  });

  test("erro do callback propaga e limpa o contexto", async () => {
    const manager = new SequelizeTransactionManager();

    await expect(
      manager.run(
        async () => {
          throw new Error("transacção falhou");
        },
        { tenantId: 3 },
      ),
    ).rejects.toThrow("transacção falhou");

    expect(currentTenantId()).toBeNull();
  });
});
