import { ValidationError } from '../../../../shared/errors/app.error';

export class ContractNumber {
  private constructor(readonly value: string) {}

  static create(value: string): ContractNumber {
    const normalized = value.trim();
    if (!normalized || normalized.length > 50) {
      throw new ValidationError('Contract number must contain 1 to 50 characters.');
    }
    return new ContractNumber(normalized);
  }
}
