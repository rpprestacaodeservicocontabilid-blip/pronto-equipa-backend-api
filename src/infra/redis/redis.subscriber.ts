import Redis from 'ioredis';
import { ENV } from '../../config/env';
import { logger } from '../../config/logger';
import { RedisManager } from './redis.manager';

/**
 * Subscriber dedicado (streaming/blocking não deve partilhar
 * a ligação principal). Criado de forma preguiçosa: nada liga no import.
 */
export class RedisSubscriber {
  private client: Redis | null = null;

  private ensureClient(): Redis | null {
    if (!RedisManager.isEnabled()) {
      return null;
    }

    if (!this.client) {
      this.client = new Redis(
        ENV.REDIS.URL || 'redis://127.0.0.1:6379',
        {
          password: ENV.REDIS.PASSWORD || undefined,
          lazyConnect: true,
          maxRetriesPerRequest: null,
        },
      );

      this.client.on('error', (error) => {
        logger.debug('Redis subscriber error', {
          error: String(error),
        });
      });
    }

    return this.client;
  }

  async subscribe(
    channel: string,
    handler: (payload: unknown) => void | Promise<void>,
  ): Promise<boolean> {
    const client = this.ensureClient();

    if (!client) {
      logger.warn(
        `⚠️ Subscrição Redis ignorada (offline): ${channel}`,
      );
      return false;
    }

    await client.subscribe(channel);
    client.on('message', (ch, message) => {
      if (ch !== channel) return;

      try {
        const payload = JSON.parse(message);
        void handler(payload);
      } catch (error) {
        logger.error('Redis subscriber: mensagem inválida', {
          error: String(error),
        });
      }
    });

    return true;
  }

  async disconnect(): Promise<void> {
    try {
      await this.client?.quit();
    } catch {
      // best-effort
    } finally {
      this.client = null;
    }
  }
}
