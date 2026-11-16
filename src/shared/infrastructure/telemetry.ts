/**
 * ============================================================
 * TELEMETRY — Módulo 03 (shared/infrastructure)
 * ============================================================
 *
 * Contrato leve de telemetria (métricas + erros) com
 * implementação provisória `NoopTelemetry`.
 *
 * Decisão do Módulo 02: NÃO instalar dependências novas —
 * a configuração `telemetry.config.ts` já existe, mas o
 * exportador (ex.: OpenTelemetry) ficou para depois. Assim,
 * os casos de uso podem já depender do contrato sem trocar
 * de implementação quando a exportação chegar.
 */

export type TelemetryLabels = Record<string, string | number | boolean | undefined>;

export interface Telemetry {
  /** Incrementa um contador (ex.: `auth.login.failed`). */
  increment(counter: string, value?: number, labels?: TelemetryLabels): void;

  /** Regista uma observação de duração/valor (histograma). */
  observe(name: string, value: number, labels?: TelemetryLabels): void;

  /** Regista um erro (para alertas/monitorização). */
  recordError(error: unknown, labels?: TelemetryLabels): void;

  /** Executa `fn` medida como span (propaga erro e resultado). */
  withSpan<T>(name: string, fn: () => Promise<T> | T, labels?: TelemetryLabels): Promise<T>;
}

/** Implementação provisória: não faz nada. */
export class NoopTelemetry implements Telemetry {
  public increment(_counter: string, _value?: number, _labels?: TelemetryLabels): void {
    // no-op
  }

  public observe(_name: string, _value: number, _labels?: TelemetryLabels): void {
    // no-op
  }

  public recordError(_error: unknown, _labels?: TelemetryLabels): void {
    // no-op
  }

  public async withSpan<T>(
    _name: string,
    fn: () => Promise<T> | T,
    _labels?: TelemetryLabels,
  ): Promise<T> {
    return fn();
  }
}
