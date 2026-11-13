import { Op } from 'sequelize';
import { EmploymentContractModel } from '../../../contracts/infrastructure/persistence/model/employment-contract.model';
import {
  ActiveContractSummary,
  ContractReader,
} from '../../application/ports/contract-reader.port';

/**
 * Adaptador de leitura do módulo `contracts`.
 *
 * Exige um contrato `ACTIVE` cuja vigência cubra o intervalo
 * inteiro [startDate, endDate] (RN-006): começa antes ou no
 * início e não termina antes do fim (ou não tem fim).
 */
export class SequelizeContractReader implements ContractReader {
  async findActiveCovering(
    companyId: number,
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<ActiveContractSummary | null> {
    const row = await EmploymentContractModel.findOne({
      where: {
        companyId,
        employeeId,
        status: 'ACTIVE',
        startDate: { [Op.lte]: startDate },
        [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: endDate } }],
      },
      order: [['startDate', 'DESC']],
    });
    if (!row) return null;

    return {
      id: row.id,
      companyId: row.companyId,
      employeeId: row.employeeId,
      status: row.status,
      startDate: String(row.startDate).slice(0, 10),
      endDate: row.endDate ? String(row.endDate).slice(0, 10) : null,
      typeCode: row.typeCode,
    };
  }
}
