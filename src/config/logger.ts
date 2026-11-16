import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { ENV } from './env';
import { SENSITIVE_FIELDS } from './logger.config';

const LOG_DIR = path.resolve(process.cwd(), 'logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Fonte única de campos sensíveis (`config/logger.config.ts`).
const SENSITIVE_KEYS = new Set(SENSITIVE_FIELDS.map((field) => field.toLowerCase()));

function redact(value: unknown, seen = new WeakSet()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    const out: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(val, seen);
    }

    return out;
  }

  if (typeof value === 'string' && /bearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(value)) {
    return value.replace(/bearer\s+[A-Za-z0-9\-._~+/]+=*/i, 'Bearer [REDACTED]');
  }

  return value;
}

const redactFormat = winston.format((info) => {
  const { level, message, timestamp, ...rest } = info;

  return {
    level,
    message,
    timestamp,
    ...((redact(rest) as Record<string, unknown>) ?? {}),
  };
});

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  redactFormat(),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  redactFormat(),
  winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}] ${message}`;
  }),
);

export const logger = winston.createLogger({
  // 'http' inclui error/warn/info/http (morgan escreve em http).
  // Produção: 'info' por omissão para reduzir ruído.
  level: process.env.LOG_LEVEL || (ENV.NODE_ENV === 'production' ? 'info' : 'http'),
  format: jsonFormat,
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      silent: ENV.NODE_ENV === 'test',
    }),
    // Rotação por tamanho (sem dependências novas): 10MB x 5 ficheiros.
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'app.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
  ],
});
