/**
 * Contrato de leitura do módulo `contracts`.
 *
 * `leave` exige um contrato ACTIVO que cubra o período de férias
 * (RN-006) — a vigência do vínculo é sempre do módulo `contracts`.
 */
export interface ActiveContractSummary {
  id: string;
  companyId: number;
  employeeId: string;
  status: string;
  startDate: string;
  endDate: string | null;
  typeCode: string;
}

export interface ContractReader {
  /**
   * Contrato activo que cobre [startDate, endDate] para o
   * trabalhador, dentro do tenant. `null` quando não há vínculo
   * vigente que justifique o gozo.
   */
  findActiveCovering(
    companyId: number,
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<ActiveContractSummary | null>;
}
