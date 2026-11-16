/**
 * Shared Infrastructure — Módulo 03
 * Adaptadores da fundação partilhada (stack actual:
 * Sequelize + memória; sem TypeORM/Postgres/S3/BullMQ).
 */

export * from './tenant-context';
export * from './sequelize-transaction-manager';
export * from './in-memory-idempotency-store';
export * from './telemetry';
