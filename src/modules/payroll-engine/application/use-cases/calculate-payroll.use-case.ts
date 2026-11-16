import {
  PayrollCalculatorPort,
  PayrollEngineInput,
  PayrollEngineResult,
} from '../../domain/contracts/payroll-engine.contract';
import { PayrollCalculationService } from '../../domain/services/payroll-calculation.service';

/** Application entry point for the deterministic domain engine. */
export class CalculatePayrollUseCase implements PayrollCalculatorPort {
  constructor(private readonly engine: PayrollCalculatorPort = new PayrollCalculationService()) {}

  calculate(input: PayrollEngineInput): PayrollEngineResult {
    return this.engine.calculate(input);
  }

  simulate(input: PayrollEngineInput): PayrollEngineResult {
    return this.engine.simulate(input);
  }

  calculateDifference(input: PayrollEngineInput): PayrollEngineResult {
    return this.engine.calculateDifference(input);
  }

  explain(result: PayrollEngineResult): PayrollEngineResult['trace'] {
    return this.engine.explain(result);
  }
}
