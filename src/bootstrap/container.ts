/**
 * ============================================================
 * CONTAINER — registo e resolução de dependências (BOOT-005)
 * ============================================================
 *
 * Contentor mínimo, sem dependências externas:
 *
 *   - `register(token, factory)` — factory recebe o contexto;
 *   - `resolve(token)`           — memoiza (singleton) e devolve;
 *   - falhas são explícitas: registo duplicado, token
 *     desconhecido ou DEPENDÊNCIA CIRCULAR lançam erro (não
 *     devolvem `undefined` silencioso), o que torna erros de
 *     composição visíveis logo no arranque.
 *
 * Em testes basta registar um adaptador diferente para o mesmo
 * token — os casos de uso não mudam.
 */

import type { ApplicationContext } from "./types/application-context";

type Factory = (context: ApplicationContext) => unknown;

export class Container {
  private readonly factories = new Map<string, Factory>();

  private readonly instances = new Map<string, unknown>();

  /** Tokens em resolução — usado para detectar ciclos (BOOT-002). */
  private readonly resolving = new Set<string>();

  private context: ApplicationContext | null = null;

  /** Liga o contexto ao contentor. Idempotente para o mesmo contexto. */
  bind(context: ApplicationContext): void {
    if (this.context && this.context !== context) {
      throw new Error("[bootstrap] container context already bound");
    }
    this.context = context;
  }

  get isBound(): boolean {
    return this.context !== null;
  }

  register<T>(
    token: string,
    factory: (context: ApplicationContext) => T,
  ): this {
    if (this.factories.has(token)) {
      throw new Error(
        `[bootstrap] duplicate registration for token "${token}"`,
      );
    }

    this.factories.set(token, factory as Factory);

    return this;
  }

  resolve<T>(token: string): T {
    if (!this.context) {
      throw new Error("[bootstrap] container has no application context");
    }

    if (this.instances.has(token)) {
      return this.instances.get(token) as T;
    }

    const factory = this.factories.get(token);

    if (!factory) {
      throw new Error(`[bootstrap] unknown token "${token}"`);
    }

    if (this.resolving.has(token)) {
      throw new Error(`[bootstrap] Circular dependency: ${token}`);
    }

    this.resolving.add(token);

    try {
      const instance = factory(this.context);

      this.instances.set(token, instance);

      return instance as T;
    } finally {
      this.resolving.delete(token);
    }
  }

  /** Como `resolve`, mas devolve `undefined` em vez de lançar. */
  tryResolve<T>(token: string): T | undefined {
    try {
      return this.resolve<T>(token);
    } catch {
      return undefined;
    }
  }

  has(token: string): boolean {
    return this.factories.has(token);
  }

  get tokens(): string[] {
    return [...this.factories.keys()];
  }

  /** Liberta instâncias e registo (encerramento / fim de teste). */
  dispose(): void {
    this.instances.clear();
    this.factories.clear();
    this.context = null;
  }
}
