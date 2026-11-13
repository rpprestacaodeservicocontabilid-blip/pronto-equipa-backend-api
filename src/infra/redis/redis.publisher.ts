import { RedisManager } from './redis.manager';
import { logger } from '../../config/logger';

export class RedisPublisher {
  async publish(channel: string, payload: unknown): Promise<boolean> {
    if (!RedisManager.isEnabled()) {
      logger.debug(`Redis pubdescartado (offline): ${channel}`);
      return false;
    }

    await RedisManager.client.publish(
      channel,
      JSON.stringify(payload),
    );
    return true;
  }
}
