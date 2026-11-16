require('ts-node/register');

const { ENV } = require('./env');

const baseConfig = {
  seederStorage: 'sequelize',

  seederStorageTableName: 'sequelize_meta',

  migrationStorageTableName: 'sequelize_migrations',
};

const configs = {
  development: {
    ...baseConfig,

    dialect: ENV.DB.DIALECT,

    storage: ENV.DB.STORAGE,

    logging: false,
  },

  test: {
    ...baseConfig,

    dialect: ENV.DB.DIALECT,

    storage: ENV.DB.STORAGE,

    logging: false,
  },

  production: {
    ...baseConfig,

    dialect: ENV.DB.DIALECT,

    host: ENV.DB.HOST,

    port: ENV.DB.PORT,

    username: ENV.DB.USER,

    password: ENV.DB.PASSWORD,

    database: ENV.DB.NAME,

    logging: false,
  },
};

module.exports = configs;
