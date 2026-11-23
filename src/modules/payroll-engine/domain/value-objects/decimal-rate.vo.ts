import { PayrollEngineError } from '../errors/payroll-engine.error';

export const DECIMAL_SCALE = 1_000_000n;
const DECIMAL_PATTERN = /^-?(0|[1-9]\d{0,15})(?:\.(\d{1,6}))?$/;

export function decimalMicros(value: string | number | bigint): bigint {
  const source = String(value);
  const match = DECIMAL_PATTERN.exec(source);
  if (!match) throw new PayrollEngineError('Invalid monetary decimal.', 'INVALID_MONEY');
  const absolute = BigInt(match[1]) * DECIMAL_SCALE + BigInt((match[2] ?? '').padEnd(6, '0'));
  return source.startsWith('-') ? -absolute : absolute;
}

export class DecimalRate {
  protected constructor(readonly micros: bigint) {}

  static parse(value: string): DecimalRate {
    return new DecimalRate(decimalMicros(value));
  }
}

export class Percentage extends DecimalRate {
  static override parse(value: string, label = 'percentage'): Percentage {
    const rate = DecimalRate.parse(value);
    if (rate.micros < 0n || rate.micros > DECIMAL_SCALE)
      throw new PayrollEngineError(`Invalid ${label}.`, 'INVALID_RULE_VALUE');
    return new Percentage(rate.micros);
  }
}
