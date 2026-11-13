import { sequelize } from './sequelize';

import { logger } from '../../config/logger';

class DatabaseManager {
  async connect() {
    try {
      await sequelize.authenticate();
      logger.info('✅ Database connected');
    } catch (error) {
      logger.error('❌ Database connection failed', error);
      throw error;
    }
  }

  async disconnect() {
    await sequelize.close();
    logger.info('🛑 Database disconnected');
  }
}

export default new DatabaseManager();
