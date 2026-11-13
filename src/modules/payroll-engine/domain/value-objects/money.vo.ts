import { PayrollEngineError } from '../errors/payroll-engine.error';

const AMOUNT = /^-?(0|[1-9]\d{0,15})(?:\.(\d{1,6}))?$/;
const SCALE = 1_000_000n;

export class Money {
  private constructor(readonly micros: bigint) {}

  static zero(): Money { return new Money(0n); }

  static parse(value: string | number | bigint): Money {
    const source = typeof value === 'number' ? String(value) : String(value);
    const match = AMOUNT.exec(source);
    if (!match) throw new PayrollEngineError('Invalid monetary decimal.', 'INVALID_MONEY');
    const negative = source.startsWith('-');
    const [whole, fraction = ''] = source.replace('-', '').split('.');
    const micros = BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
    return new Money(negative ? -micros : micros);
  }

  add(other: Money): Money { return new Money(this.micros + other.micros); }
  subtract(other: Money): Money { return new Money(this.micros - other.micros); }
  min(other: Money): Money { return this.micros <= other.micros ? this : other; }
  max(other: Money): Money { return this.micros >= other.micros ? this : other; }
  isNegative(): boolean { return this.micros < 0n; }
  isZero(): boolean { return this.micros === 0n; }
  compare(other: Money): number { return this.micros < other.micros ? -1 : this.micros > other.micros ? 1 : 0; }

  multiplyRate(rate: string): Money {
    const normalized = Money.parse(rate);
    return new Money((this.micros * normalized.micros) / SCALE);
  }

  multiplyFraction(numerator: bigint, denominator: bigint): Money {
    if (denominator <= 0n) throw new PayrollEngineError('Invalid fraction denominator.', 'INVALID_FRACTION');
    return new Money((this.micros * numerator) / denominator);
  }

  divide(divisor: bigint): Money {
    if (divisor === 0n) throw new PayrollEngineError('Division by zero.', 'DIVISION_BY_ZERO');
    return new Money((this.micros * SCALE) / divisor);
  }

  round(mode: 'HALF_UP' | 'HALF_EVEN' | 'DOWN' | 'UP' = 'HALF_UP'): Money {
    const unit = 10_000n;
    const abs = this.micros < 0n ? -this.micros : this.micros;
    const quotient = abs / unit;
    const remainder = abs % unit;
    let increment = false;
    if (mode === 'UP') increment = remainder > 0n;
    if (mode === 'HALF_UP') increment = remainder * 2n >= unit;
    if (mode === 'HALF_EVEN') increment = remainder * 2n > unit || (remainder * 2n === unit && quotient % 2n === 1n);
    const rounded = (quotient + (increment ? 1n : 0n)) * unit;
    return new Money(this.micros < 0n ? -rounded : rounded);
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
