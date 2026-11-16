import {
  PayrollInputSnapshot,
  PayrollCalculationResult,
} from '../../../payroll/application/ports/payroll-calculator.port';
import { SimulationPeriod } from '../../domain/simulation.types';
export interface SimulationSourcesPort {
  read(
    companyId: number,
    runId: string,
    employeeId: string,
    period: SimulationPeriod,
  ): Promise<Omit<PayrollInputSnapshot, 'inputSnapshotId' | 'inputHash'>>;
  selectEmployees(
    companyId: number,
    options: {
      employeeIds?: string[];
      excludeEmployeeIds?: string[];
      departmentId?: number;
      jobCategory?: string;
    },
  ): Promise<string[]>;
  officialResults(
    companyId: number,
    payrollRunId: string,
  ): Promise<
    Array<{
      employeeId: string;
      grossAmount: string;
      deductionsAmount: string;
      netAmount: string;
      employerCostsAmount: string;
      currency: string;
    }>
  >;
}
export interface SimulationCalculatorPort {
  calculate(snapshot: PayrollInputSnapshot): Promise<PayrollCalculationResult>;
}
