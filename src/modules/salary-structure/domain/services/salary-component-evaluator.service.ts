import { ValidationError } from '../../../../shared/errors/app.error';

const MAX_CENTS = 999_999_999_999_999_999n;

export const salaryCents = (value: string): bigint => {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) {
    throw new ValidationError('A valid non-negative salary amount is required.');
  }
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > MAX_CENTS) throw new ValidationError('Salary amount exceeds the supported range.');
  return cents;
};

export const salaryMoney = (cents: bigint): string => {
  if (cents < 0n || cents > MAX_CENTS)
    throw new ValidationError('Resolved salary amount is outside the supported range.');
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
};

const percentToScale = (value: string): bigint => {
  if (!/^(0|[1-9]\d{0,2})(\.\d{1,4})?$/.test(value)) {
    throw new ValidationError('A valid percentage between 0 and 999.9999 is required.');
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'));
};

export interface SalaryCalculationComponent {
  type: string;
  method: string;
  amount: string | null;
  percentage: string | null;
  calculationConfig: Record<string, unknown>;
  sourceReference: string | null;
}

export class SalaryComponentEvaluatorService {
  evaluate(component: SalaryCalculationComponent, baseSalary: string): string | null {
    const baseCents = salaryCents(baseSalary);
    if (component.type === 'BASE_SALARY') return salaryMoney(baseCents);
    if (component.method === 'FIXED_AMOUNT' || component.method === 'ONE_TIME') {
      if (component.amount === null)
        throw new ValidationError('Fixed salary components require an amount.');
      return salaryMoney(salaryCents(component.amount));
    }
    if (component.method === 'PERCENTAGE') {
      if (component.percentage === null)
        throw new ValidationError('Percentage components require a percentage.');
      return salaryMoney(
        (baseCents * percentToScale(component.percentage) + 500_000n) / 1_000_000n,
      );
    }
    if (component.method === 'VARIABLE_INPUT') {
      if (component.amount === null || !component.sourceReference) {
        throw new ValidationError(
          'Variable salary components require an amount and authorized source reference.',
        );
      }
      return salaryMoney(salaryCents(component.amount));
    }
    if (component.method === 'FORMULA') {
      const { operation, percentage } = component.calculationConfig;
      if (operation !== 'PERCENT_OF_BASE' || typeof percentage !== 'string') {
        throw new ValidationError('Only the declarative PERCENT_OF_BASE formula is supported.');
      }
      return salaryMoney((baseCents * percentToScale(percentage) + 500_000n) / 1_000_000n);
    }
    if (component.method === 'CONDITIONAL') {
      const enabled = component.calculationConfig.enabled === true;
      if (!enabled) return null;
      if (component.amount === null)
        throw new ValidationError('Enabled conditional components require an amount.');
      return salaryMoney(salaryCents(component.amount));
    }
    throw new ValidationError('Unsupported salary component calculation method.');
  }
}
