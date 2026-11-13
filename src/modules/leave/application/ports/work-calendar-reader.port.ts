import { WorkCalendar } from '../../domain/services/leave-days-calculator.service';

/**
 * Contrato de leitura do calendário laboral (módulo
 * `organization`).
 *
 * Fornece a configuração de dias úteis e excepções (feriados)
 * aplicável a um intervalo; quando não há calendário activo, o
 * adaptador devolve a semana-padrão (segunda a sexta).
 */
export interface WorkCalendarReader {
  /**
   * Calendário efectivo para o intervalo, dentro do tenant.
   * `departmentId`/`establishmentId` permitem escopo fino
   * (RF-034/035); omitidos usam o calendário da empresa.
   */
  getCalendar(
    companyId: number,
    startDate: string,
    endDate: string,
    scope?: { departmentId?: number | null; establishmentId?: string | null },
  ): Promise<WorkCalendar>;
}
