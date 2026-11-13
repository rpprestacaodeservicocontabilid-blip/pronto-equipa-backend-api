import { RabbitMQManager } from './rabbitmq.manager';
import { logger } from '../../config/logger';

export class RabbitMQPublisher {
  async publish(queue: string, payload: unknown): Promise<boolean> {
    if (!RabbitMQManager.isConnected()) {
      logger.debug(`RabbitMQ pub descartado (offline): ${queue}`);
      return false;
    }

    const channel = RabbitMQManager.getChannel();

    await channel.assertQueue(queue, { durable: true });

    return channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true },
    );
  }
}
