import { Op } from 'sequelize';
import { EmployeeModel } from '../../../employees/infrastructure/persistence/model/employee.model';
import { EmployeeReader, EmployeeSummary } from '../../application/ports/employee-reader.port';

/**
 * Adaptador de leitura do módulo `employees`.
 *
 * `findActive` aceita trabalhadores em situação laboral que
 * permite gozar férias: `ACTIVE` ou `ON_LEAVE` (exclui
 * `SUSPENDED`/`TERMINATED`). O filtro é sempre composto com o
 * `companyId` — nunca há leitura fora do tenant.
 */
export class SequelizeEmployeeReader implements EmployeeReader {
  async findActive(companyId: number, employeeId: string): Promise<EmployeeSummary | null> {
    const row = await EmployeeModel.findOne({
      where: {
        id: employeeId,
        companyId,
        status: { [Op.in]: ['ACTIVE', 'ON_LEAVE'] },
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      companyId: row.companyId,
      employeeNumber: row.employeeNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      admissionDate: new Date(row.admissionDate).toISOString().slice(0, 10),
      departmentId: row.departmentId,
      status: row.status,
      terminationDate: row.terminationDate
        ? new Date(row.terminationDate).toISOString().slice(0, 10)
        : null,
    };
  }
}
