import type { EnvVars } from "./env";

export interface RedisConfig {
  /** `true` quando há URL/prefix configurados; o cliente decide. */
  enabled: boolean;
  url: string;
  password: string;
  prefix: string;
}

/**
 * Redis é OPCIONAL: quando não está configurado a aplicação
 * degrada explicitamente (`degraded` no readiness) em vez de
 * falhar o arranque.
 */
export function createRedisConfig(
  env: Pick<EnvVars, "REDIS_URL" | "REDIS_PASSWORD" | "REDIS_PREFIX">,
): RedisConfig {
  return {
    enabled: env.REDIS_URL.length > 0,
    url: env.REDIS_URL,
    password: env.REDIS_PASSWORD,
    prefix: env.REDIS_PREFIX,
  };
}
