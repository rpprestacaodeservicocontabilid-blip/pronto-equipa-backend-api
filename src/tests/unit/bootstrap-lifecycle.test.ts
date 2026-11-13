import { Lifecycle } from "../../bootstrap/lifecycle";

// ============================================================
// BOOT-007 — gestão do ciclo de vida da aplicação
// ============================================================

describe("Lifecycle", () => {
  it("percorre created → initializing → ready → draining → stopped", () => {
    const lifecycle = new Lifecycle();

    expect(lifecycle.state).toBe("created");
    expect(lifecycle.isReady).toBe(false);
    expect(lifecycle.isAcceptingRequests).toBe(false);

    lifecycle.markInitializing();
    expect(lifecycle.state).toBe("initializing");

    lifecycle.markReady();
    expect(lifecycle.isReady).toBe(true);
    expect(lifecycle.isAcceptingRequests).toBe(true);

    lifecycle.beginDrain();
    expect(lifecycle.isDraining).toBe(true);
    expect(lifecycle.isAcceptingRequests).toBe(false);

    lifecycle.markStopped();
    expect(lifecycle.state).toBe("stopped");
  });

  it("impede transições ilegais", () => {
    const lifecycle = new Lifecycle();

    expect(() => lifecycle.markReady()).toThrow(
      "invalid lifecycle transition: created -> ready",
    );

    lifecycle.markInitializing();
    lifecycle.markReady();

    expect(() => lifecycle.markInitializing()).toThrow(
      "invalid lifecycle transition: ready -> initializing",
    );

    lifecycle.beginDrain();

    expect(() => lifecycle.markReady()).toThrow(
      "invalid lifecycle transition: draining -> ready",
    );
  });

  it("suporta falha de inicialização e de encerramento", () => {
    const lifecycle = new Lifecycle();

    lifecycle.markInitializing();
    lifecycle.markFailed();

    expect(lifecycle.state).toBe("failed");

    lifecycle.markStopped();
    expect(lifecycle.state).toBe("stopped");

    // Falha durante o draining também é explícita.
    const other = new Lifecycle();
    other.markInitializing();
    other.markReady();
    other.beginDrain();
    other.markFailed();

    expect(other.state).toBe("failed");
  });

  it("é idempotente no encerramento (BOOT-008)", () => {
    const lifecycle = new Lifecycle();

    lifecycle.markInitializing();
    lifecycle.markReady();
    lifecycle.beginDrain();
    lifecycle.beginDrain();
    lifecycle.markStopped();
    lifecycle.markStopped();
    lifecycle.markFailed();

    expect(lifecycle.state).toBe("stopped");
  });

  it("notifica ouvintes e permite cancelar a subscrição", () => {
    const lifecycle = new Lifecycle();
    const seen: string[] = [];

    const unsubscribe = lifecycle.onTransition((next, previous) => {
      seen.push(`${previous}->${next}`);
    });

    lifecycle.markInitializing();
    lifecycle.markReady();

    unsubscribe();
    lifecycle.beginDrain();

    expect(seen).toEqual(["created->initializing", "initializing->ready"]);
  });

  it("ignora ouvintes que lançam erro", () => {
    const lifecycle = new Lifecycle();

    lifecycle.onTransition(() => {
      throw new Error("listener failed");
    });

    lifecycle.markInitializing();

    expect(lifecycle.state).toBe("initializing");
  });

  it("representa o estado em string", () => {
    const lifecycle = new Lifecycle();

    expect(String(lifecycle)).toBe("created");
  });
});
