import amqp from 'amqplib';
import { ENV } from '../../config/env';
import { logger } from '../../config/logger';

const CONNECT_TIMEOUT_MS = 5000;
const MAX_RETRIES = 5;

class RabbitMQManagerClass {
  // any de propósito: os tipos do amqplib variam entre versões.
  private connection: any = null;

  private channel: any = null;

  private connecting: Promise<void> | null = null;

  /**
   * Liga ao broker com retries limitados. Nunca lança no boot:
   * devolve false e o módulo publica/consome em modo degradado.
   */
  async connect(retries = MAX_RETRIES): Promise<boolean> {
    if (this.channel) return true;
    if (this.connecting) {
      await this.connecting.catch(() => undefined);
      return this.channel !== null;
    }

    this.connecting = this.doConnect(retries);

    try {
      await this.connecting;
      return true;
    } catch {
      return false;
    } finally {
      this.connecting = null;
    }
  }

  private async doConnect(retries: number): Promise<void> {
    const url = ENV.RABBITMQ.URL;

    if (!url) {
      logger.warn('⚠️ RABBITMQ_URL não definido — mensageria desativada.');
      throw new Error('RABBITMQ_URL missing');
    }

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.connection = await this.withTimeout(amqp.connect(url), CONNECT_TIMEOUT_MS);

        this.connection.on('error', (error: any) => {
          logger.error('❌ RabbitMQ connection error', {
            error: String(error),
          });
          this.channel = null;
        });

        this.connection.on('close', () => {
          logger.warn('⚠️ RabbitMQ connection closed');
          this.channel = null;
          this.connection = null;
        });

        this.channel = await this.connection.createChannel();
        await this.channel.prefetch(10);

        logger.info('✅ RabbitMQ connected');
        return;
      } catch (error) {
        lastError = error;
        this.channel = null;
        this.connection = null;
        logger.warn(`🔁 RabbitMQ tentativa ${attempt}/${retries} falhou.`);
        await this.sleep(Math.min(attempt * 1000, 5000));
      }
    }

    logger.warn('⚠️ RabbitMQ indisponível — a correr sem message broker.');
    logger.debug('RabbitMQ connect detail', {
      error: String(lastError),
    });
    throw lastError;
  }

  isConnected(): boolean {
    return this.channel !== null;
  }

  getChannel(): any {
    if (!this.channel) {
      throw new Error('RabbitMQ channel indisponível (broker offline).');
    }

    return this.channel;
  }

  async disconnect() {
    try {
      await this.channel?.close();
    } catch {
      // best-effort
    } finally {
      this.channel = null;
    }

    try {
      await this.connection?.close();
    } catch {
      // best-effort
    } finally {
      this.connection = null;
      logger.info('🛑 RabbitMQ disconnected');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    return Promise.race([
      promise.finally(() => {
        if (timer) clearTimeout(timer);
      }),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('RabbitMQ connect timeout')), ms);
      }),
    ]);
  }
}

export const RabbitMQManager = new RabbitMQManagerClass();
export default RabbitMQManager;
