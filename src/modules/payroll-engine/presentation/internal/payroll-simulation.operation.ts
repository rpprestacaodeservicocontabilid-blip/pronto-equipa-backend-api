import { Request } from 'express';
import { z } from 'zod';
import { AppError } from '../../../../shared/errors/app.error';
import { SimulateSamplePayrollUseCase } from '../../application/use-cases/simulate-sample-payroll.use-case';
import { PayrollEngineError } from '../../domain/errors/payroll-engine.error';

const sampleAmount = z.string().max(23).regex(/^(0|[1-9]\d{0,11})(?:\.\d{1,6})?$/);
const sampleSchema = z.object({
  month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
  baseSalary: sampleAmount,
  allowance: sampleAmount,
  annualAllowance: sampleAmount,
  deduction: sampleAmount,
  deductionAuthorized: z.boolean(),
  rounding: z.enum(['HALF_UP', 'HALF_EVEN', 'DOWN', 'UP']),
}).strict();

const simulator = new SimulateSamplePayrollUseCase();

export async function simulateSamplePayroll(req: Request, companyId: number) {
  const scenario = sampleSchema.parse(req.body);
  try {
    return simulator.execute(companyId, scenario);
  } catch (error) {
    if (error instanceof PayrollEngineError) throw new AppError(error.message, 422, error.code);
    throw error;
  }
}
