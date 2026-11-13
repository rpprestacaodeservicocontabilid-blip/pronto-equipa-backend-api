/**
 * Instância única da aplicação.
 *
 * Mantém o contrato histórico (`import { app } from "main/app"`)
 * usado pelos testes de integração: a instância é criada na
 * importação, mas NUNCA abre uma porta (BOOT-008) — a escuta
 * acontece apenas em `src/bootstrap/server.ts`.
 */

import { createApp } from "../bootstrap/app";

export const app = createApp();

export default app;
