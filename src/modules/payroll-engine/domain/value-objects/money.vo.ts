import { RoundingMode } from '../contracts/payroll-engine.contract';
import { PayrollEngineError } from '../errors/payroll-engine.error';
import { DECIMAL_SCALE as SCALE, DecimalRate, decimalMicros } from './decimal-rate.vo';
import { RoundingPolicy } from './rounding-policy.vo';

export class Money {
  private constructor(readonly micros: bigint) {}

  static zero(): Money {
    return new Money(0n);
  }

  static parse(value: string | number | bigint): Money {
    return new Money(decimalMicros(value));
  }

  add(other: Money): Money {
    return new Money(this.micros + other.micros);
  }
  subtract(other: Money): Money {
    return new Money(this.micros - other.micros);
  }
  min(other: Money): Money {
    return this.micros <= other.micros ? this : other;
  }
  max(other: Money): Money {
    return this.micros >= other.micros ? this : other;
  }
  isNegative(): boolean {
    return this.micros < 0n;
  }
  isZero(): boolean {
    return this.micros === 0n;
  }
  compare(other: Money): number {
    return this.micros < other.micros ? -1 : this.micros > other.micros ? 1 : 0;
  }

  multiplyRate(rate: string | DecimalRate): Money {
    const normalized = typeof rate === 'string' ? DecimalRate.parse(rate) : rate;
    return new Money((this.micros * normalized.micros) / SCALE);
  }

  multiplyFraction(numerator: bigint, denominator: bigint): Money {
    if (denominator <= 0n)
      throw new PayrollEngineError('Invalid fraction denominator.', 'INVALID_FRACTION');
    return new Money((this.micros * numerator) / denominator);
  }

  divide(divisor: bigint): Money {
    if (divisor === 0n) throw new PayrollEngineError('Division by zero.', 'DIVISION_BY_ZERO');
    return new Money((this.micros * SCALE) / divisor);
  }

  round(mode: RoundingMode = 'HALF_UP'): Money {
    return new Money(RoundingPolicy.parse({ mode, scale: 2 }).roundMicros(this.micros));
  }

  toString(): string {
    const rounded = this.round('HALF_UP').micros;
    const abs = rounded < 0n ? -rounded : rounded;
    return `${rounded < 0n ? '-' : ''}${abs / SCALE}.${String((abs % SCALE) / 10_000n).padStart(2, '0')}`;
  }
}

export function sumMoney(values: Money[]): Money {
  return values.reduce((sum, value) => sum.add(value), Money.zero());
}
