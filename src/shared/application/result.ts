/**
 * ============================================================
 * RESULT — Módulo 03 (shared/application)
 * ============================================================
 *
 * Representação explícita de sucesso ou falha SEM excepções:
 *
 *   - `Result.ok(value)`    → sucesso com valor;
 *   - `Result.fail(error)`  → falha com erro de domínio;
 *   - `map` / `flatMap`     → encadeamento;
 *   - `match`               → desambiguação total no chamador.
 *
 * Os casos de uso devolvem `Result` em vez de lançar, o que
 * torna o fluxo de erro verificável no tipo.
 */

export class Result<T = void, E = Error> {
  private constructor(
    private readonly succeeded: boolean,
    private readonly internalValue?: T,
    private readonly internalError?: E,
  ) {}

  public static ok(): Result<void, never>;
  public static ok<T>(value: T): Result<T, never>;
  public static ok<T>(value?: T): Result<T, never> {
    return new Result<T, never>(true, value);
  }

  public static fail<E>(error: E): Result<never, E> {
    if (error === null || error === undefined) {
      throw new Error("[result] fail requires an error");
    }

    return new Result<never, E>(false, undefined, error);
  }

  /** Envolve uma função síncrona que pode lançar. */
  public static tryCatch<T>(fn: () => T): Result<T, unknown> {
    try {
      return Result.ok(fn());
    } catch (error) {
      return Result.fail(error);
    }
  }

  /** Envolve uma função assíncrona que pode rejeitar. */
  public static async tryCatchAsync<T>(
    fn: () => Promise<T>,
  ): Promise<Result<T, unknown>> {
    try {
      return Result.ok(await fn());
    } catch (error) {
      return Result.fail(error);
    }
  }

  public get isOk(): boolean {
    return this.succeeded;
  }

  public get isFail(): boolean {
    return !this.succeeded;
  }

  /** Valor do sucesso. Lança se o resultado for falha. */
  public get value(): T {
    if (!this.succeeded) {
      throw new Error(
        `[result] no value on failure: ${String(this.internalError)}`,
      );
    }

    return this.internalValue as T;
  }

  /** Erro da falha. Lança se o resultado for sucesso. */
  public get error(): E {
    if (this.succeeded) {
      throw new Error("[result] no error on success");
    }

    return this.internalError as E;
  }

  public unwrap(): T {
    return this.value;
  }

  public unwrapOr(defaultValue: T): T {
    return this.succeeded ? (this.internalValue as T) : defaultValue;
  }

  public unwrapError(): E {
    return this.error;
  }

  public map<U>(fn: (value: T) => U): Result<U, E> {
    if (!this.succeeded) {
      return Result.fail(this.internalError as E);
    }

    return Result.ok(fn(this.internalValue as T));
  }

  public mapError<F>(fn: (error: E) => F): Result<T, F> {
    if (this.succeeded) {
      return Result.ok(this.internalValue as T);
    }

    return Result.fail(fn(this.internalError as E));
  }

  public flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (!this.succeeded) {
      return Result.fail(this.internalError as E);
    }

    return fn(this.internalValue as T);
  }

  public match<U>(handlers: { ok: (value: T) => U; fail: (error: E) => U }): U {
    return this.succeeded
      ? handlers.ok(this.internalValue as T)
      : handlers.fail(this.internalError as E);
  }
}
