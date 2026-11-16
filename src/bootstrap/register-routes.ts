/**
 * ============================================================
 * ROTAS — montagem da API (BOOT-004)
 * ============================================================
 *
 *  /health/live   liveness  — o processo está vivo?
 *  /health        alias legacy da liveness (docker healthcheck)
 *  /health/ready  readiness — dependências prontas a servir?
 *  /ready         alias do readiness
 *  /api/v1/*      API (composition root em `src/main/routes.ts`)
 *  /uploads       ficheiros enviados (dev)
 *  /api-docs      Swagger (dev/test)
 */

import express, { type Express, type Request, type Response } from 'express';

import routes from '../main/routes';
import { ENV } from '../config/env';
import { swaggerDocs } from '../docs/swaggers';

import type { ApplicationContext } from './types/application-context';

/**
 * Readiness: só responde 200 quando o ciclo de vida está `ready`
 * E nenhuma dependência crítica está em baixo. O corpo mostra o
 * estado de cada verificação para diagnóstico.
 */
function sendReadiness(context: ApplicationContext, res: Response): void {
  const snapshot = context.health.snapshot();

  const ready = context.lifecycle.isReady && snapshot.status !== 'down';

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    state: context.lifecycle.state,
    checks: snapshot.checks,
    timestamp: new Date().toISOString(),
  });
}

export function registerRoutes(app: Express, context: ApplicationContext): void {
  // --------------------------------------------------------
  // LIVENESS (BOOT-009) — o processo responde?
  // --------------------------------------------------------
  // Não depende de nenhuma outra dependência: responde 200
  // sempre que o processo HTTP está vivo, mesmo durante o
  // encerramento (os orquestradores precisam disto).
  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'alive',
      app: ENV.APP.NAME,
      env: ENV.NODE_ENV,
      state: context.lifecycle.state,
      timestamp: new Date().toISOString(),
    });
  });

  // Alias legacy — mesmo significado da liveness.
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      app: ENV.APP.NAME,
      env: ENV.NODE_ENV,
      state: context.lifecycle.state,
      timestamp: new Date().toISOString(),
    });
  });

  // --------------------------------------------------------
  // READINESS (BOOT-009)
  // --------------------------------------------------------
  app.get('/health/ready', (_req: Request, res: Response) => {
    sendReadiness(context, res);
  });

  app.get('/ready', (_req: Request, res: Response) => {
    sendReadiness(context, res);
  });

  // --------------------------------------------------------
  // API
  // --------------------------------------------------------
  app.use('/api/v1', routes);

  /**
   * Ficheiros enviados (ex.: mensagens de voz do chat).
   * Em dev ficam em `uploads/`; em produção usa-se storage externo.
   */
  app.use('/uploads', express.static('uploads'));

  // Documentação (apenas ambientes de desenvolvimento/teste)
  if (ENV.FLAGS.isDev || ENV.FLAGS.isTest) {
    swaggerDocs(app);
  }
}
