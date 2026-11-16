/**
 * Ponto de entrada da aplicação.
 *
 * Toda a composição (validação de ambiente, módulos, Express,
 * escuta, sinais e encerramento gracioso) vive em
 * `src/bootstrap`. Este ficheiro apenas invoca o arranque e
 * garante uma falha controlada (BOOT-003): log + exit(1).
 */

import { startServer } from '../bootstrap/server';
import { logger } from '../config/logger';

startServer().catch((error) => {
  logger.error('❌ Falha ao iniciar servidor', error);
  process.exit(1);
});
