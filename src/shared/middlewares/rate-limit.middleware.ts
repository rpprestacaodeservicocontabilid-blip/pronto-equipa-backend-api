import rateLimit, {
  MemoryStore,
  type Store,
  type Options as RateLimitOptions,
} from 'express-rate-limit';
import { RedisManager } from '../../infra/redis/redis.manager';

const skipInTest = () => process.env.NODE_ENV === 'test';

/**
 * Store Redis mínimo para express-rate-limit.
 * Só é usado quando o Redis está pronto; caso contrário
 * o limiter usa MemoryStore (uma instância partilhada).
 */
function createRedisStore(
  prefix: string,
  windowMs: number,
): Store | undefined {
  if (!RedisManager.isEnabled()) {
    return undefined;
  }

  return {
    async increment(key: string) {
      const redisKey = `ratelimit:${prefix}:${key}`;
      const client = RedisManager.client;
      const totalHits = await client.incr(redisKey);

      if (totalHits === 1) {
        await client.pexpire(redisKey, windowMs);
      }

      const ttl = await client.pttl(redisKey);

      return {
        totalHits,
        resetTime: new Date(Date.now() + Math.max(ttl, 0)),
      };
    },

    async decrement(key: string) {
      const redisKey = `ratelimit:${prefix}:${key}`;
      await RedisManager.client.decr(redisKey);
    },

    async resetKey(key: string) {
      const redisKey = `ratelimit:${prefix}:${key}`;
      await RedisManager.client.del(redisKey);
    },
  } as Store;
}

function buildLimiter(
  prefix: string,
  windowMs: number,
  limit: number,
  message: string,
  extra?: Partial<RateLimitOptions>,
): ReturnType<typeof rateLimit> {
  // O store é resolvido em cada request: Redis quando
  // disponível, memória caso contrário (sem crash no boot).
  let memoryFallback: Store | undefined;

  return rateLimit({
    windowMs,
    limit,
    message: {
      success: false,
      error: { message, code: 'RATE_LIMIT_EXCEEDED' },
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => skipInTest(),
    store: {
      // Cada limiter tem a sua própria instância/store namespace. Sem isto,
      // express-rate-limit identifica todos os stores literais como "Object"
      // e acusa falso ERR_ERL_DOUBLE_COUNT quando dois limites são encadeados.
      localKeys: true,
      async increment(key: string) {
        const store =
          createRedisStore(prefix, windowMs) ??
          (memoryFallback ??= new MemoryStore());

        return store.increment(key);
      },
      async decrement(key: string) {
        const store =
          createRedisStore(prefix, windowMs) ?? memoryFallback;

        if (store) await store.decrement(key);
      },
      async resetKey(key: string) {
        const store =
          createRedisStore(prefix, windowMs) ?? memoryFallback;

        if (store) await store.resetKey(key);
      },
    } as Store,
    ...extra,
  });
}

/**
 * Limite global da API — protege contra rajadas de
 * chamadas simultâneas em todos os ambientes.
 */
export const apiLimiter = buildLimiter(
  'api',
  60 * 1000,
  Number(process.env.RATE_LIMIT_MAX_REQUESTS || 600),
  'Demasiadas requisições. Tente novamente em 1 minuto.',
);

/**
 * Limite estrito para autenticação (brute-force).
 * Só conta respostas falhadas.
 */
export const authLimiter = buildLimiter(
  'auth',
  5 * 60 * 1000,
  Number(process.env.RATE_LIMIT_AUTH_MAX || 20),
  'Demasiadas tentativas. Tente novamente em 5 minutos.',
  { skipSuccessfulRequests: true },
);

/** Compatibilidade: limite global da API. */
export const publicLimiter = apiLimiter;

/** Limite para criação de recursos. */
export const createLimiter = buildLimiter(
  'create',
  15 * 60 * 1000,
  100,
  'Limite de criação de recursos atingido. Tente novamente mais tarde.',
);

/** Limiter com chave por utilizador autenticado (ou IP em fallback). */
export function createUserRateLimiter(
  prefix: string,
  windowMs = 15 * 60 * 1000,
  limit = 100,
) {
  return buildLimiter(prefix, windowMs, limit, 'Limite excedido.', {
    keyGenerator: (req) => {
      const user = (req as unknown as { user?: { id?: number } }).user;
      if (user?.id !== undefined) {
        return `user-${user.id}`;
      }
      return req.ip || 'unknown';
    },
  });
}
