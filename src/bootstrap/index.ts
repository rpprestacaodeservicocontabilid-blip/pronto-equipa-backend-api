/**
 * ============================================================
 * BOOTSTRAP — API pública do módulo
 * ============================================================
 *
 * `createApp`         → instância Express (sem escuta — BOOT-008)
 * `startServer`       → arranque completo com escuta e sinais
 * `createContext...`  → contexto + contentor para composição
 * `Lifecycle`         → máquina de estados (BOOT-006/009)
 * `HealthRegistry`    → prontidão por dependência (BOOT-004)
 * `Container`         → registo/resolução de dependências
 * `initializeModules` → arranque de módulos com rollback
 * `loadEnvironment`   → validação do ambiente (BOOT-001)
 */

export { createApp, createApplicationContext } from "./app";
export { startServer } from "./server";
export { Lifecycle } from "./lifecycle";
export { HealthRegistry } from "./health";
export { Container } from "./container";
export {
  createShutdownHandler,
  closeHttpServer,
  ShutdownError,
  type ShutdownFn,
  type ShutdownOptions,
} from "./shutdown";
export { HttpError } from "./register-error-handlers";
export {
  defaultModules,
  initializeModules,
  shutdownModules,
} from "./register-modules";
export { registerMiddlewares } from "./register-middlewares";
export { registerRoutes } from "./register-routes";
export { registerErrorHandlers } from "./register-error-handlers";
export {
  loadEnvironment,
  validateEnvironment,
  type BootstrapEnvironment,
} from "./validate-environment";

export type {
  ApplicationContext,
  AppDependencies,
  BootstrapConfig,
  CreateContextOptions,
  HealthStatus,
  LifecycleState,
  Logger,
  ModuleDefinition,
} from "./types/application-context";
