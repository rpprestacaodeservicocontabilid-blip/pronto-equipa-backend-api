export class BankAccount {
  readonly bankName: string;
  readonly accountName: string;
  readonly accountNumber: string;
  readonly iban: string | null;

  constructor(input: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    iban?: string | null;
  }) {
    this.bankName = this.required(input.bankName, 'Bank name', 120);
    this.accountName = this.required(input.accountName, 'Account name', 150);
    this.accountNumber = this.required(input.accountNumber, 'Account number', 50);
    this.iban = input.iban
      ? this.required(input.iban, 'IBAN', 34).replace(/\s/g, '').toUpperCase()
      : null;
    if (this.iban && !/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(this.iban)) {
      throw new Error('IBAN format is invalid.');
    }
  }

  private required(value: string, field: string, maxLength: number): string {
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength) {
      throw new Error(`${field} must contain 1 to ${maxLength} characters.`);
    }
    return normalized;
  }
}
