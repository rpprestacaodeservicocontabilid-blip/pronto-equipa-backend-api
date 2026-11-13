/**
 * Contrato de leitura do módulo `employees`.
 *
 * O módulo `leave` NÃO duplica a gestão de trabalhadores:
 * apenas valida existência e situação laboral (RN-003 / RF-017).
 */
export interface EmployeeSummary {
  id: string;
  companyId: number;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  admissionDate: string;
  departmentId: number | null;
  status: string;
  terminationDate: string | null;
}

export interface EmployeeReader {
  /** Trabalhador dentro do tenant — `null` se não existir/outro tenant. */
  findActive(companyId: number, employeeId: string): Promise<EmployeeSummary | null>;
}
