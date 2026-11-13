import Redis from 'ioredis';
import { ENV } from '../../config/env';
import { logger } from '../../config/logger';

const CONNECT_TIMEOUT_MS = 5000;

class RedisManagerClass {
  public client: Redis;

  private enabled = false;

  private warned = false;

  constructor() {
    // lazyConnect: nada liga no import — connect() é explícito no boot.
    this.client = new Redis(ENV.REDIS.URL || 'redis://127.0.0.1:6379', {
      password: ENV.REDIS.PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 500, 5000);
        logger.warn(`🔁 Redis reconnect attempt: ${times}`);
        return delay;
      },
    });

    this.registerEvents();
  }

  private registerEvents() {
    this.client.on('connect', () => {
      logger.info('✅ Redis connected');
    });

    this.client.on('ready', () => {
      this.enabled = true;
      logger.info('🚀 Redis ready');
    });

    this.client.on('error', (error) => {
      this.enabled = false;
      if (!this.warned) {
        this.warned = true;
        logger.warn(
          '⚠️ Redis indisponível — cache/rate-limit usam fallback em memória.',
        );
      }
      logger.debug('Redis error detail', { error: String(error) });
    });

    this.client.on('close', () => {
      this.enabled = false;
      logger.warn('⚠️ Redis connection closed');
    });

    this.client.on('reconnecting', () => {
      logger.warn('🔄 Redis reconnecting...');
    });
  }

  /**
   * Liga ao Redis com timeout curto. Nunca lança: em falha,
   * o módulo fica em modo degradado (fallbacks em memória).
   */
  async connect(): Promise<boolean> {
    try {
      await this.withTimeout(
        this.client.connect(),
        CONNECT_TIMEOUT_MS,
      );
      this.enabled = true;
      return true;
    } catch (error) {
      this.enabled = false;
      logger.warn(
        '⚠️ Redis indisponível no arranque — a correr sem cache distribuída.',
      );
      logger.debug('Redis connect detail', { error: String(error) });
      // Evita retries infinitos em background quando o servidor não existe.
      this.client.disconnect();
      return false;
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.client.status === 'ready';
  }

  async disconnect() {
    try {
      this.client.removeAllListeners();
      if (this.client.status !== 'end') {
        await this.client.quit();
      }
    } catch {
      // shutdown best-effort
    } finally {
      this.enabled = false;
      logger.info('🛑 Redis disconnected');
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    return Promise.race([
      promise.finally(() => {
        if (timer) clearTimeout(timer);
      }),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Redis connect timeout')),
          ms,
        );
      }),
    ]);
  }
}

export const RedisManager = new RedisManagerClass();
