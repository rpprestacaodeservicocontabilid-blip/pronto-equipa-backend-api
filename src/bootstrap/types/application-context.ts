/**
 * ============================================================
 * BOOTSTRAP — CONTRATOS (BOOT-005)
 * ============================================================
 *
 * Todos os módulos de negócio são registados através do contrato
 * explícito `ModuleDefinition` e recebem um `ApplicationContext`.
 * Nenhum módulo importa singletons concretos do bootstrap: só
 * estes contratos, o que permite substituir implementações em
 * testes sem alterar os casos de uso.
 */

import type { Express } from 'express';

import type { Container } from '../container';
import type { HealthRegistry } from '../health';
import type { Lifecycle } from '../lifecycle';

// ============================================================
// CICLO DE VIDA (BOOT-006 / BOOT-009)
// ============================================================

/**
 * Estados do ciclo de vida da aplicação.
 *
 *   created → initializing → ready → draining → stopped
 *                    ↓           ↓
 *                   failed ──────┘
 */
export type LifecycleState =
  | 'created'
  | 'initializing'
  | 'ready'
  | 'draining'
  | 'stopped'
  | 'failed';

// ============================================================
// SAÚDE / PRONTIDÃO (BOOT-004)
// ============================================================

export type HealthStatus = 'up' | 'degraded' | 'down';

// ============================================================
// LOGGER (contrato mínimo — §5)
// ============================================================

/**
 * Logger estruturado mínimo exigido pelo bootstrap.
 * Aceita o logger Winston actual sem o acoplar aos módulos.
 */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  http(...args: unknown[]): void;
}

// ============================================================
// CONFIGURAÇÃO VALIDADA (BOOT-001)
// ============================================================

export interface BootstrapConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  /** Interface de escuta. `0.0.0.0` para ser alcançável em Docker. */
  host: string;
  jwtSecret: string;
  /** Tempo máximo (ms) do encerramento gracioso. */
  shutdownTimeoutMs: number;
}

// ============================================================
// MÓDULOS (BOOT-005 / BOOT-010)
// ============================================================

/**
 * Contrato explícito de registo de um módulo de infraestrutura
 * ou de negócio no arranque da aplicação.
 */
export interface ModuleDefinition {
  /** Identificador único usado em logs e na saúde da aplicação. */
  name: string;

  /**
   * Quando `true`, uma falha em `init` aborta o arranque (BOOT-003).
   * Quando `false` (omissão), a falha degrada a aplicação sem a
   * impedir de ficar pronta.
   */
  critical?: boolean;

  /**
   * Fase de registo (BOOT-002/003): coloca os serviços do módulo
   * no contentor ANTES de qualquer `init`. Corre para TODOS os
   * módulos antes de arrancar qualquer um, o que permite ao
   * contentor detectar dependências circulares e registos
   * duplicados cedo.
   */
  register?(container: Container): void;

  init?(context: ApplicationContext): Promise<void> | void;

  /** Chamado no encerramento (ordem inversa) e no rollback (BOOT-010). */
  shutdown?(context: ApplicationContext): Promise<void> | void;
}

// ============================================================
// CONTEXTO DA APLICAÇÃO
// ============================================================

/**
 * Contexto partilhado entregue a todos os módulos registados.
 * É a única via de acesso a configuração, saúde, ciclo de vida,
 * contentor de dependências e logger.
 */
export interface ApplicationContext {
  readonly config: BootstrapConfig;
  readonly container: Container;
  readonly lifecycle: Lifecycle;
  readonly health: HealthRegistry;
  readonly logger: Logger;
  readonly startedAt: Date;
}

export interface CreateContextOptions {
  container?: Container;
  lifecycle?: Lifecycle;
  health?: HealthRegistry;
  logger?: Logger;
  config?: BootstrapConfig;
}

// ============================================================
// COMPOSIÇÃO DO EXPRESS (§2.3 do plano)
// ============================================================

/**
 * Dependências injectadas em `createApp`.
 *
 * `registerRoutes` / `registerErrorHandlers` / `allowedOrigins`
 * são o contrato mínimo do plano; os restantes campos permitem
 * compor o contexto de forma explícita (arranque real vs testes).
 */
export interface AppDependencies {
  /** Contexto pré-construído (arranque real). Se omitido, é criado. */
  context?: ApplicationContext;

  config?: BootstrapConfig;
  lifecycle?: Lifecycle;
  health?: HealthRegistry;
  logger?: Logger;

  /**
   * Origens CORS. `true` reflete qualquer origem (apenas
   * dev/test — em produção a lista é obrigatória e validada em
   * `config/cors.config.ts`).
   */
  allowedOrigins?: string[] | true;

  registerMiddlewares?(app: Express, context: ApplicationContext): void;
  registerRoutes?(app: Express, context: ApplicationContext): void;
  registerErrorHandlers?(app: Express, context: ApplicationContext): void;
}
