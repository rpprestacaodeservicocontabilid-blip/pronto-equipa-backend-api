/**
 * ============================================================
 * MIDDLEWARES GLOBAIS — ordem de registo
 * ============================================================
 *
 *  1. identificação da requisição (correliação — BOOT-007)
 *  2. rejeição de tráfego durante o encerramento (BOOT-009)
 *  3. proxy / CORS / helmet
 *  4. body parsers
 *  5. logging HTTP (com requestId)
 *  6. rate limiting (global e de autenticação)
 *
 * As rotas são registadas depois, em `register-routes`.
 */

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { randomUUID } from 'crypto';

import { ENV } from '../config/env';
import { createCorsConfig } from '../config/cors.config';
import { logger } from '../config/logger';
import { apiLimiter, authLimiter } from '../shared/middlewares/rate-limit.middleware';

import type { ApplicationContext } from './types/application-context';

const REQUEST_ID_HEADER = 'x-request-id';

/** Formato aceitável de um `X-Request-Id` vindo do cliente. */
const REQUEST_ID_PATTERN = /^[\w.:-]{1,128}$/;

/** Caminhos que continuam a responder durante o draining (BOOT-009). */
const LIVENESS_PATHS = new Set(['/health', '/health/live', '/health/ready', '/ready']);

/**
 * Atribui um identificador de correliação a cada requisição.
 * Aceita o `X-Request-Id` do cliente (trace entre serviços) ou
 * gera um UUID, devolvendo-o sempre na resposta.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);

  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
}

/**
 * Rejeita novos pedidos quando a aplicação está a encerrar
 * (BOOT-009). Os pedidos em curso terminam normalmente; os
 * novos recebem 503 + `Retry-After`. Os endpoints de vida
 * continuam acessíveis aos orquestradores.
 */
export function createDrainGuard(context: ApplicationContext) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { state } = context.lifecycle;

    if (state !== 'draining' && state !== 'stopped' && state !== 'failed') {
      next();
      return;
    }

    if (LIVENESS_PATHS.has(req.path)) {
      next();
      return;
    }

    res.setHeader('Retry-After', '5');

    res.status(503).json({
      success: false,
      error: {
        message: 'Service is shutting down',
        code: 'SERVICE_UNAVAILABLE',
        statusCode: 503,
        timestamp: new Date().toISOString(),
      },
    });
  };
}

export interface RegisterMiddlewaresOptions {
  /**
   * Origens CORS explícitas. `true` reflete qualquer origem
   * (apenas dev/test — `createCorsConfig` garante que produção
   * nunca fica sem lista). Quando omitido, deriva de `config/`.
   */
  allowedOrigins?: string[] | true;
}

/** Origens por omissão: derivadas do módulo `config/` (fonte única). */
let defaultCors: ReturnType<typeof createCorsConfig> | undefined;

function resolveOrigin(options: RegisterMiddlewaresOptions): string[] | true {
  if (options.allowedOrigins !== undefined) {
    return options.allowedOrigins;
  }

  defaultCors ??= createCorsConfig({
    NODE_ENV: ENV.NODE_ENV,
    FRONTEND_URL: ENV.APP.FRONTEND_URL,
    CORS_ORIGIN: process.env.CORS_ORIGIN ?? '',
  });

  return defaultCors.allowAnyOrigin ? true : defaultCors.origins;
}

export function registerMiddlewares(
  app: Express,
  context: ApplicationContext,
  options: RegisterMiddlewaresOptions = {},
): void {
  app.disable('x-powered-by');

  // 1. Correliação de requisições ( BOOT-007 )
  app.use(requestIdMiddleware);

  // 2. Draining ( BOOT-009 )
  app.use(createDrainGuard(context));

  app.set('trust proxy', 1);

  // 3. CORS + helmet (opções validadas em `config/cors.config`)
  const corsOptions = resolveOrigin(options);

  app.use(
    cors({
      origin: corsOptions,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id', 'X-Pronto-Session', 'X-Audit-Purpose'],
    }),
  );

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );

  // 4. Body parsers
  app.use(
    express.json({
      limit: '10mb',
    }),
  );

  app.use(
    express.urlencoded({
      extended: true,
      limit: '10mb',
    }),
  );

  // 5. Logging HTTP com requestId
  morgan.token('request-id', (req) => {
    return (req as unknown as { requestId?: string }).requestId ?? '-';
  });

  const morganFormat = ENV.FLAGS.isProd
    ? ':remote-addr - :remote-user [:request-id] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
    : '[:request-id] :method :url :status :response-time ms';

  app.use(
    morgan(morganFormat, {
      stream: {
        write: (message) => logger.http(message.trim()),
      },
      // Health checks não devem encher os logs.
      skip: (req) => req.path === '/health' || req.path === '/api/v1/health',
    }),
  );

  // 6. Rate limiting — proteção global e anti brute-force no login.
  //    (o Express executa por ordem de registo: antes das rotas)
  app.use('/api', apiLimiter);
  app.use('/api/v1/auth', authLimiter);
  app.use('/api/v1/oauth', authLimiter);
}
