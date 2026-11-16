import type { EnvVars } from './env';

export interface QueueConfig {
  /** `false` quando não há RabbitMQ configurado (desligado). */
  enabled: boolean;
  url: string;
  prefetch: number;
  concurrency: number;
  maxRetries: number;
  backoffMs: number;
}

/**
 * Filas (RabbitMQ). Opcional por omissão: sem URL a aplicação
 * funciona sem processamento assíncrono e regista o estado como
 * `degraded` no readiness.
 */
export function createQueueConfig(
  env: Pick<
    EnvVars,
    | 'RABBITMQ_URL'
    | 'RABBITMQ_PREFETCH'
    | 'QUEUE_CONCURRENCY'
    | 'QUEUE_MAX_RETRIES'
    | 'QUEUE_BACKOFF_MS'
  >,
): QueueConfig {
  return {
    enabled: env.RABBITMQ_URL.length > 0,
    url: env.RABBITMQ_URL,
    prefetch: env.RABBITMQ_PREFETCH,
    concurrency: env.QUEUE_CONCURRENCY,
    maxRetries: env.QUEUE_MAX_RETRIES,
    backoffMs: env.QUEUE_BACKOFF_MS,
  };
}
