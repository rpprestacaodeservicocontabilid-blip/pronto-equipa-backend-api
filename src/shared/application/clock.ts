/**
 * ============================================================
 * CLOCK — Módulo 03 (shared/application)
 * ============================================================
 *
 * Abstracção do tempo: o domínio/casos de uso nunca chamam
 * `new Date()` directamente — dependem do `Clock`, o que
 * permite testes determinísticos (ex.: expiração de tokens,
 * janelas de idempotência, sessões).
 */

export interface Clock {
  /** Instante actual. */
  now(): Date;
}

/** Relógio de produção: tempo real do sistema. */
export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}

/** Relógio de teste: tempo controlado pelo próprio teste. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(start: Date | string | number = new Date()) {
    this.current = new Date(start);
  }

  public now(): Date {
    // Devolve cópia: não é possível alterar o relógio por fora.
    return new Date(this.current.getTime());
  }

  /** Avança (ou recua, com valor negativo) o relógio. */
  public advance(ms: number): Date {
    this.current = new Date(this.current.getTime() + ms);
    return this.now();
  }

  /** Coloca o relógio num instante exacto. */
  public set(instant: Date | string | number): Date {
    this.current = new Date(instant);
    return this.now();
  }
}
