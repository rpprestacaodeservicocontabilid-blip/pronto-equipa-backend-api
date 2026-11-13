import { Sequelize } from 'sequelize';
import { ENV } from '../../config/env';

const isSQLite = ENV.DB.DIALECT === 'sqlite';

export const sequelize = isSQLite
  ? new Sequelize({
      dialect: 'sqlite',
      storage: ENV.DB.STORAGE,
      logging: false,
    })
  : new Sequelize({
      dialect: ENV.DB.DIALECT as any,
      host: ENV.DB.HOST,
      port: ENV.DB.PORT,
      username: ENV.DB.USER,
      password: ENV.DB.PASSWORD,
      database: ENV.DB.NAME,
      logging: false,

      pool: {
        max: 10,
        min: 2,
        acquire: 30000,
        idle: 10000,
      },
    });
