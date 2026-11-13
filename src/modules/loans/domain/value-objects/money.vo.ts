import { ValidationError } from '../../../../shared/errors/app.error';

const AMOUNT = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
const MAX_CENTS = 999_999_999_999_999n;

export class Money {
  private constructor(
    readonly cents: bigint,
    readonly currency: string,
  ) {}

  static create(value: string, currency: string): Money {
    if (!AMOUNT.test(value) || !/^[A-Z]{3}$/.test(currency)) {
      throw new ValidationError(
        'A valid non-negative monetary amount and ISO currency are required.',
      );
    }
    const [whole, fraction = ''] = value.split('.');
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    if (cents > MAX_CENTS)
      throw new ValidationError('Money exceeds the supported database amount.');
    return new Money(cents, currency);
  }

  static fromCents(cents: bigint, currency: string): Money {
    if (!/^[A-Z]{3}$/.test(currency))
      throw new ValidationError('A valid ISO currency is required.');
    if (cents < 0n || cents > MAX_CENTS)
      throw new ValidationError('Money is outside the supported range.');
    return new Money(cents, currency);
  }

  add(other: Money): Money {
    this.assertCurrency(other);
    return Money.fromCents(this.cents + other.cents, this.currency);
  }

  subtract(other: Money): Money {
    this.assertCurrency(other);
    if (other.cents > this.cents) throw new ValidationError('Money balance cannot be negative.');
    return Money.fromCents(this.cents - other.cents, this.currency);
  }

  toString(): string {
    return `${this.cents / 100n}.${String(this.cents % 100n).padStart(2, '0')}`;
  }

  private assertCurrency(other: Money): void {
    if (this.currency !== other.currency) throw new ValidationError('Currencies must match.');
  }
}
