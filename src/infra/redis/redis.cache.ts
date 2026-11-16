import { RedisManager } from './redis.manager';
import { logger } from '../../config/logger';

const DEFAULT_TTL_SECONDS = 300;

/**
 * Cache simples sobre Redis com degradação graciosa:
 * sem Redis, get devolve null e set/del são no-ops.
 */
export const RedisCache = {
  async get<T>(key: string): Promise<T | null> {
    if (!RedisManager.isEnabled()) return null;

    try {
      const raw = await RedisManager.client.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (error) {
      logger.debug('RedisCache.get falhou', {
        key,
        error: String(error),
      });
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<void> {
    if (!RedisManager.isEnabled()) return;

    try {
      await RedisManager.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      logger.debug('RedisCache.set falhou', {
        key,
        error: String(error),
      });
    }
  },

  async del(key: string): Promise<void> {
    if (!RedisManager.isEnabled()) return;

    try {
      await RedisManager.client.del(key);
    } catch (error) {
      logger.debug('RedisCache.del falhou', {
        key,
        error: String(error),
      });
    }
  },
};
