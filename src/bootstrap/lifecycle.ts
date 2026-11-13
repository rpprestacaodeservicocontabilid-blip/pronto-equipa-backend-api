/**
 * ============================================================
 * LIFECYCLE — máquina de estados de inicialização/encerramento
 * ============================================================
 *
 * BOOT-006 (encerramento gracioso), BOOT-009 (rejeitar novos
 * pedidos durante o encerramento) e BOOT-007 (registo de
 * eventos de inicialização e encerramento — feito pelos
 * chamadores através de `onTransition`).
 */

import type { LifecycleState } from "./types/application-context";

const ALLOWED_TRANSITIONS: Record<LifecycleState, readonly LifecycleState[]> = {
  created: ["initializing", "draining", "stopped"],
  initializing: ["ready", "failed", "draining"],
  ready: ["draining", "failed"],
  draining: ["stopped", "failed"],
  failed: ["stopped", "draining"],
  stopped: [],
};

export type LifecycleListener = (
  next: LifecycleState,
  previous: LifecycleState,
) => void;

export class Lifecycle {
  private currentState: LifecycleState = "created";

  private readonly listeners = new Set<LifecycleListener>();

  get state(): LifecycleState {
    return this.currentState;
  }

  /** Pronto a servir tráfego. */
  get isReady(): boolean {
    return this.currentState === "ready";
  }

  /** A encerrar: novos pedidos recebem 503 (BOOT-009). */
  get isDraining(): boolean {
    return this.currentState === "draining";
  }

  /** Alias explícito do requisito BOOT-009. */
  get isAcceptingRequests(): boolean {
    return this.currentState === "ready";
  }

  canTransition(next: LifecycleState): boolean {
    return ALLOWED_TRANSITIONS[this.currentState].includes(next);
  }

  /**
   * Transição de estado. Estados repetidos são ignorados
   * (idempotência do encerramento); transições ilegais lançam.
   */
  transition(next: LifecycleState): void {
    const previous = this.currentState;

    if (previous === next) return;

    if (!this.canTransition(next)) {
      throw new Error(
        `[bootstrap] invalid lifecycle transition: ${previous} -> ${next}`,
      );
    }

    this.currentState = next;

    for (const listener of this.listeners) {
      try {
        listener(next, previous);
      } catch {
        // Um ouvinte falhado não pode partir o ciclo de vida.
      }
    }
  }

  /** Subscreve a transições. Devolve a função de cancelamento. */
  onTransition(listener: LifecycleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  markInitializing(): void {
    this.transition("initializing");
  }

  markReady(): void {
    this.transition("ready");
  }

  /** Entra em draining (idempotente). No-op se já parou. */
  beginDrain(): void {
    if (this.currentState === "draining" || this.currentState === "stopped") {
      return;
    }
    this.transition("draining");
  }

  markFailed(): void {
    if (
      this.currentState === "failed" ||
      this.currentState === "stopped"
    ) {
      return;
    }
    this.transition("failed");
  }

  markStopped(): void {
    if (this.currentState === "stopped") return;
    this.transition("stopped");
  }

  toString(): string {
    return this.currentState;
  }
}
