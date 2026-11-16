/**
 * ============================================================
 * REGISTO E INICIALIZAÇÃO DE MÓDULOS (BOOT-005 / BOOT-010)
 * ============================================================
 *
 * Ordem de arranque:
 *
 *   1. validar ambiente            (BOOT-001)
 *   2. criar logger + contexto + contentor
 *   3. inicializar módulos         (BOOT-002)
 *   4. verificar prontidão         (BOOT-004)
 *   5. montar Express e rotas
 *   6. iniciar servidor HTTP
 *
 * Falhas:
 *
 *   - módulo CRÍTICO falha → rollback do que já arrancou
 *     (BOOT-010) e propagação controlada (BOOT-003);
 *   - módulo opcional falha → aplicação continua em modo
 *     degradado, com o estado registado na saúde.
 */

import { DatabaseManager } from '../infra/database';
import { RedisManager } from '../infra/redis';
import { RabbitMQManager } from '../infra/rabbitmq';
import JobsManager from '../jobs';
import { PayrollRuntime } from '../modules/payroll/infrastructure/jobs/payroll-runtime';
import { sharedModule } from '../shared/shared.module';
import {
  payments,
  payslips,
  simulations,
  documents,
  subscriptions,
  platformBilling,
  onboarding,
  notifications,
  support,
  audit,
} from '../main/routes';

import type { ApplicationContext, ModuleDefinition } from './types/application-context';

/**
 * Módulos por omissão do arranque real.
 *
 * `database` é crítico (a aplicação não serve tráfego sem
 * persistência). Redis, RabbitMQ e jobs são opcionais: os
 * respectivos managers degradam para memória/desligado.
 */
export function defaultModules(): ModuleDefinition[] {
  const payrollRuntime = new PayrollRuntime();
  return [
    // Fundação partilhada (Módulo 03): relogio, transacções
    // com contexto de tenant, idempotência e telemetria.
    // Registado primeiro — qualquer módulo posterior resolve
    // os tokens na fase `register`.
    sharedModule(),
    {
      name: 'database',
      critical: true,
      async init(context) {
        await DatabaseManager.connect();
        context.health.set('database', 'up', true);
      },
      async shutdown(context) {
        await DatabaseManager.disconnect();
        context.health.set('database', 'down', true);
      },
    },
    {
      name: 'audit',
      critical: true,
      async init() {
        await audit.runtime.start();
      },
      async shutdown() {
        await audit.runtime.stop();
      },
    },
    {
      name: 'redis',
      async init(context) {
        const up = await RedisManager.connect();
        context.health.set('redis', up ? 'up' : 'degraded');
      },
      async shutdown(context) {
        await RedisManager.disconnect();
        context.health.set('redis', 'down');
      },
    },
    {
      name: 'rabbitmq',
      async init(context) {
        const up = await RabbitMQManager.connect();
        context.health.set('rabbitmq', up ? 'up' : 'degraded');
      },
      async shutdown(context) {
        await RabbitMQManager.disconnect();
        context.health.set('rabbitmq', 'down');
      },
    },
    {
      name: 'jobs',
      init(context) {
        JobsManager.initializeJobs();
        context.logger.info('[bootstrap] scheduled jobs registered');
      },
      shutdown() {
        JobsManager.stopAllJobs();
      },
    },
    {
      name: 'payroll-workers',
      init() {
        payrollRuntime.start();
      },
      async shutdown() {
        await payrollRuntime.stop();
      },
    },
    {
      name: 'payments-payroll-outbox-consumer',
      init() {
        payments.outboxRuntime.start();
      },
      async shutdown() {
        await payments.outboxRuntime.stop();
      },
    },
    {
      name: 'simulations-workers',
      init() {
        simulations.runtime.start();
      },
      async shutdown() {
        await simulations.runtime.stop();
      },
    },
    {
      name: 'payslips-workers',
      init() {
        payslips.runtime.start();
      },
      async shutdown() {
        await payslips.runtime.stop();
      },
    },
    {
      name: 'documents-workers',
      init() {
        documents.runtime.start();
      },
      async shutdown() {
        await documents.runtime.stop();
      },
    },
    {
      name: 'notifications-runtime',
      init() {
        notifications.runtime.start();
      },
      async shutdown() {
        await notifications.runtime.stop();
      },
    },
    {
      name: 'support-runtime',
      init() {
        support.runtime.start();
      },
      async shutdown() {
        support.runtime.stop();
      },
    },
    {
      name: 'onboarding-runtime',
      init() {
        onboarding.runtime.start();
      },
      async shutdown() {
        await onboarding.runtime.stop();
      },
    },
    {
      name: 'platform-billing-runtime',
      init() {
        platformBilling.runtime.start();
      },
      async shutdown() {
        await platformBilling.runtime.stop();
      },
    },
    {
      name: 'subscriptions-lifecycle',
      init() {
        subscriptions.runtime.start();
      },
      async shutdown() {
        await subscriptions.runtime.stop();
      },
    },
  ];
}

/**
 * Inicializa os módulos pela ordem dada, em DUAS fases:
 *
 *   1. registo controlado — nomes únicos e `register(container)`
 *      de todos os módulos, antes de arrancar qualquer um
 *      (BOOT-002/003);
 *   2. arranque — `init(context)` pela ordem definida.
 *
 * Devolve os módulos efectivamente inicializados (para o
 * encerramento e para o rollback). Lança o erro original
 * quando um módulo crítico falha, depois de libertar tudo o
 * que já tinha arrancado (BOOT-010).
 */
export async function initializeModules(
  context: ApplicationContext,
  modules: ModuleDefinition[],
): Promise<ModuleDefinition[]> {
  // --------------------------------------------------------
  // Fase 1 — registo controlado
  // --------------------------------------------------------
  const names = new Set<string>();

  for (const definition of modules) {
    if (names.has(definition.name)) {
      throw new Error(`[bootstrap] duplicate module: ${definition.name}`);
    }

    names.add(definition.name);
  }

  for (const definition of modules) {
    definition.register?.(context.container);
  }

  // --------------------------------------------------------
  // Fase 2 — arranque pela ordem definida
  // --------------------------------------------------------
  const initialized: ModuleDefinition[] = [];

  for (const definition of modules) {
    try {
      context.logger.info(`[bootstrap] initializing module "${definition.name}"`);

      if (definition.init) {
        await definition.init(context);
      }

      initialized.push(definition);

      context.logger.info(`[bootstrap] module "${definition.name}" initialized`);
    } catch (error) {
      context.logger.error(`[bootstrap] module "${definition.name}" failed to initialize`, error);

      if (definition.critical) {
        await shutdownModules(context, initialized);
        throw error;
      }

      context.health.set(definition.name, 'down', false);
      context.logger.warn(
        `[bootstrap] optional module "${definition.name}" unavailable — continuing degraded`,
      );
    }
  }

  return initialized;
}

/**
 * Encerra os módulos pela ordem INVERSA da inicialização.
 *
 * Cada falha é registada mas não impede os restantes — no
 * encerramento, libertar tudo é mais importante do que a
 * ordem perfeita. Devolve os erros encontrados para que o
 * chamador decida como os tratar (rollback ignora; o
 * encerramento gracioso falha explicitamente — BOOT-008).
 */
export async function shutdownModules(
  context: ApplicationContext,
  modules: ModuleDefinition[],
): Promise<unknown[]> {
  const errors: unknown[] = [];

  for (const definition of [...modules].reverse()) {
    if (!definition.shutdown) continue;

    try {
      context.logger.info(`[bootstrap] shutting down module "${definition.name}"`);

      await definition.shutdown(context);
    } catch (error) {
      context.logger.warn(`[bootstrap] module "${definition.name}" shutdown failed`, error);

      errors.push(error);
    }
  }

  return errors;
}
