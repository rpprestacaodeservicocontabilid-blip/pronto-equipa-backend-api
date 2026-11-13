import type { EnvVars } from "./env";

export interface TelemetryConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  endpoint: string;
  traceHeader: string;
}

/**
 * TELEMETRIA — apenas configuração (sem dependências novas).
 *
 * Quando activada, os adaptadores de infraestrutura usam estes
 * valores para propagar `traceparent` e exportar spans para o
 * endpoint indicado. Desactivada por omissão.
 */
export function createTelemetryConfig(env: Pick<EnvVars,
  | "TELEMETRY_ENABLED"
  | "TELEMETRY_ENDPOINT"
  | "TELEMETRY_TRACE_HEADER"
  | "APP_NAME"
  | "APP_VERSION">): TelemetryConfig {
  const endpoint = env.TELEMETRY_ENDPOINT;

  return {
    enabled: env.TELEMETRY_ENABLED === "true" && endpoint.length > 0,
    serviceName: env.APP_NAME,
    serviceVersion: env.APP_VERSION,
    endpoint,
    traceHeader: env.TELEMETRY_TRACE_HEADER,
  };
}
