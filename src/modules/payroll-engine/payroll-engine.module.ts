import { PayrollCalculationService } from './domain/services/payroll-calculation.service';
import { PayrollCalculatorAdapter } from './infrastructure/adapters/payroll-calculator.adapter';

export function createPayrollEngineModule() {
  const calculationService = new PayrollCalculationService();
  return {
    calculationService,
    payrollCalculator: new PayrollCalculatorAdapter(calculationService),
  };
}
