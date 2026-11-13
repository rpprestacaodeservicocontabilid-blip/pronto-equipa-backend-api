import { ValidationError } from '../../../../shared/errors/app.error';

export class OrganizationCode {
  private constructor(readonly value: string) {}

  static create(value: string): OrganizationCode {
    const code = value.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/.test(code)) {
      throw new ValidationError('Code must contain 1 to 50 valid characters.');
    }
    return new OrganizationCode(code);
  }
}
