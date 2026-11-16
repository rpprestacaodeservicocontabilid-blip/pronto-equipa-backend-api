import { PayrollCalculationService } from './domain/services/payroll-calculation.service';
import { PayrollCalculatorAdapter } from './infrastructure/adapters/payroll-calculator.adapter';
import { CalculatePayrollUseCase } from './application/use-cases/calculate-payroll.use-case';

export function createPayrollEngineModule() {
  const calculationService = new PayrollCalculationService();
  const calculatePayroll = new CalculatePayrollUseCase(calculationService);
  return {
    calculationService,
    calculatePayroll,
    payrollCalculator: new PayrollCalculatorAdapter(calculatePayroll),
  };
}
