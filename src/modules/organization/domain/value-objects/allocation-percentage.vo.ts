import { ValidationError } from '../../../../shared/errors/app.error';

export class AllocationPercentage {
  private constructor(readonly value: string) {}

  static create(value: number | string): AllocationPercentage {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
      throw new ValidationError('Allocation percentage must be greater than 0 and at most 100.');
    }
    return new AllocationPercentage(parsed.toFixed(2));
  }

  static assertTotal100(values: Array<number | string>): void {
    const total = values.reduce<number>((sum, value) => sum + Number(value), 0);
    if (Math.abs(total - 100) > 0.001) {
      throw new ValidationError('Cost allocation percentages must total exactly 100%.');
    }
  }
}
