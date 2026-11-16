import { logger } from '../config/logger';
import { ContractExpirationJob } from '../modules/contracts/infrastructure/jobs/contract-expiration.job';

/**
 * Gestor de jobs agendados (cron).
 *
 * A Fase 1 do backend ProntoEquipas não possui jobs periódicos.
 * Novos jobs (ex.: alertas de contratos, reprocessamento salarial)
 * devem ser registados aqui, mantendo a mesma interface
 * `initializeJobs` / `stopAllJobs`.
 */
export class JobsManager {
  private static isInitialized = false;
  private static contractExpirationJob: ContractExpirationJob | null = null;

  static initializeJobs(): void {
    if (this.isInitialized) {
      logger.warn('[JobsManager] Jobs já foram inicializados');
      return;
    }

    try {
      this.contractExpirationJob = new ContractExpirationJob();
      this.contractExpirationJob.start();
      logger.info(
        '[JobsManager] Contract expiration alerts scheduled daily at 02:00 Africa/Luanda.',
      );
      this.isInitialized = true;
    } catch (error) {
      logger.error('[JobsManager] Erro ao inicializar jobs:', { err: error });
    }
  }

  static stopAllJobs(): void {
    try {
      if (!this.isInitialized) {
        return;
      }

      logger.info('[JobsManager] Parando todos os jobs...');
      this.contractExpirationJob?.stop();
      this.contractExpirationJob = null;
      this.isInitialized = false;
      logger.info('[JobsManager] Todos os jobs foram parados');
    } catch (error) {
      logger.error('[JobsManager] Erro ao parar jobs:', { err: error });
    }
  }
}

export default JobsManager;
