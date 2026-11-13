/**
 * ============================================================
 * APP — criação da instância Express (BOOT-008)
 * ============================================================
 *
 * `createApp` monta middlewares, rotas e handlers de erro numa
 * instância Express SEM iniciar a escuta HTTP — é isso que
 * permite testes HTTP com Supertest sem abrir uma porta de
 * rede (BOOT-008).
 *
 * A composição real (módulos, ligações, escuta, sinais) vive
 * em `server.ts`.
 */

import express, { type Express } from "express";

import "express-async-errors";

import { logger as defaultLogger } from "../config/logger";

import { Container } from "./container";
import { HealthRegistry } from "./health";
import { Lifecycle } from "./lifecycle";
import { registerErrorHandlers } from "./register-error-handlers";
import { registerMiddlewares } from "./register-middlewares";
import { registerRoutes } from "./register-routes";
import { validateEnvironment } from "./validate-environment";

import type {
  AppDependencies,
  ApplicationContext,
  CreateContextOptions,
} from "./types/application-context";

/**
 * Cria e liga o contexto da aplicação ao contentor.
 *
 * Em produção (`server.ts`) o contexto é criado ANTES do app
 * para que os módulos possam ser inicializados com ele; em
 * testes basta chamar `createApp()`.
 */
export function createApplicationContext(
  options: CreateContextOptions = {},
): ApplicationContext {
  const container = options.container ?? new Container();
  const lifecycle = options.lifecycle ?? new Lifecycle();
  const health = options.health ?? new HealthRegistry();
  const config = options.config ?? validateEnvironment();

  const context: ApplicationContext = {
    config,
    container,
    lifecycle,
    health,
    logger: options.logger ?? defaultLogger,
    startedAt: new Date(),
  };

  container.bind(context);

  // Serviços base sempre disponíveis no contentor.
  container.register("app.context", () => context);
  container.register("app.lifecycle", () => lifecycle);
  container.register("app.health", () => health);
  container.register("app.config", () => config);

  return context;
}

/**
 * Compõe a aplicação Express a partir das dependências dadas.
 *
 * Sem dependências usa a composição real (middlewares, rotas e
 * handlers da aplicação). Os três registos podem ser
 * substituídos para testar a aplicação em isolamento.
 */
export function createApp(dependencies: AppDependencies = {}): Express {
  const context =
    dependencies.context ??
    createApplicationContext({
      config: dependencies.config,
      lifecycle: dependencies.lifecycle,
      health: dependencies.health,
      logger: dependencies.logger,
    });

  const app = express();

  // Contexto acessível aos handlers e testes.
  app.locals.context = context;

  if (dependencies.registerMiddlewares) {
    dependencies.registerMiddlewares(app, context);
  } else {
    registerMiddlewares(app, context, {
      allowedOrigins: dependencies.allowedOrigins,
    });
  }

  if (dependencies.registerRoutes) {
    dependencies.registerRoutes(app, context);
  } else {
    registerRoutes(app, context);
  }

  if (dependencies.registerErrorHandlers) {
    dependencies.registerErrorHandlers(app, context);
  } else {
    registerErrorHandlers(app, context);
  }

  return app;
}

export default createApp;
