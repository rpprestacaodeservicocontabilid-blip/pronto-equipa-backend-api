'use strict';

// Production migrations target MySQL 8.4. PostgreSQL remains supported only
// by the separate PostgreSQL integration profile, never by this deployment config.
const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required for production migrations.`);
}

if (process.env.DB_DIALECT !== 'mysql') {
  throw new Error('Production migrations require DB_DIALECT=mysql.');
}

module.exports = {
  production: {
    dialect: 'mysql',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    logging: false,
    migrationStorageTableName: 'sequelize_migrations',
    dialectOptions:
      process.env.DB_SSL === 'true'
        ? {
            ssl: {
              rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
            },
          }
        : {},
  },
};
