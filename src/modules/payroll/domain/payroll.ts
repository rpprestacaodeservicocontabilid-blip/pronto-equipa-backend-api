import { ConflictError, ValidationError } from '../../../shared/errors/app.error';

export const runTypes = [
  'REGULAR',
  'OFF_CYCLE',
  'SUPPLEMENTARY',
  'RETROACTIVE',
  'CORRECTION',
  'TERMINATION',
  'SIMULATION',
] as const;
export type RunType = (typeof runTypes)[number];
export type RunStatus =
  | 'DRAFT'
  | 'VALIDATING'
  | 'VALIDATION_FAILED'
  | 'PROCESSING'
  | 'PARTIALLY_PROCESSED'
  | 'FAILED'
  | 'READY_FOR_REVIEW'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CLOSED'
  | 'CANCELLED';

export class PayrollPeriod {
  static validate(startDate: string, endDate: string, paymentDate: string): void {
    for (const value of [startDate, endDate, paymentDate]) {
      const date = new Date(`${value}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      )
        throw new ValidationError('Invalid payroll date.');
    }
    if (startDate > endDate) throw new ValidationError('Period start must precede its end.');
  }
}

export class PayrollRun {
  static cancel(status: RunStatus): RunStatus {
    if (
      ![
        'DRAFT',
        'VALIDATING',
        'VALIDATION_FAILED',
        'READY_FOR_REVIEW',
        'PARTIALLY_PROCESSED',
        'FAILED',
        'REJECTED',
      ].includes(status)
    )
      throw new ConflictError('This execution cannot be cancelled.');
    return 'CANCELLED';
  }
  static scope(scope: string, employeeIds: string[]): void {
    if (
      !employeeIds.length ||
      new Set(employeeIds).size !== employeeIds.length ||
      (scope === 'INDIVIDUAL' && employeeIds.length !== 1)
    )
      throw new ValidationError('Select distinct employees matching the execution scope.');
  }
}

// Monetary reconciliation only: tax and remuneration formulas belong to payroll-engine.
export class PayrollEmployeeResult {
  static reconcile(gross: string, deductions: string, net: string): void {
    const cents = (value: string): bigint => {
      if (!/^(0|[1-9]\d{0,15})\.\d{2}$/.test(value))
        throw new ValidationError('Use exact monetary strings with two decimal places.');
      return BigInt(value.replace('.', ''));
    };
    if (cents(gross) - cents(deductions) !== cents(net))
      throw new ValidationError('Payroll result totals do not reconcile.');
  }
}
