import { RabbitMQManager } from './rabbitmq.manager';
import { logger } from '../../config/logger';

export class RabbitMQConsumer {
  async consume(queue: string, callback: (data: unknown) => Promise<void>): Promise<boolean> {
    if (!RabbitMQManager.isConnected()) {
      logger.warn(`⚠️ Consumo RabbitMQ ignorado (offline): ${queue}`);
      return false;
    }

    const channel = RabbitMQManager.getChannel();

    await channel.assertQueue(queue, { durable: true });

    await channel.consume(queue, async (message: any) => {
      if (!message) return;

      try {
        const data = JSON.parse(message.content.toString());
        await callback(data);
        channel.ack(message);
      } catch (error) {
        logger.error(`RabbitMQ: falha ao processar ${queue}`, {
          error: String(error),
        });
        // Rejeita sem requeue para evitar poison-message loop.
        channel.nack(message, false, false);
      }
    });

    return true;
  }
}
