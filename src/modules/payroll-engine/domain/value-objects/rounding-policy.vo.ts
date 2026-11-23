import { RoundingMode } from '../contracts/payroll-engine.contract';
import { PayrollEngineError } from '../errors/payroll-engine.error';

export class RoundingPolicy {
  private constructor(readonly mode: RoundingMode, readonly scale: 2) {}

  static parse(policy: { mode: RoundingMode; scale: 2 } | undefined): RoundingPolicy {
    if (!policy || policy.scale !== 2 || !['HALF_UP', 'HALF_EVEN', 'DOWN', 'UP'].includes(policy.mode))
      throw new PayrollEngineError(
        'Monetary rounding policy must be explicit and use two places.',
        'INVALID_ROUNDING_POLICY',
      );
    return new RoundingPolicy(policy.mode, policy.scale);
  }

  roundMicros(micros: bigint): bigint {
    const unit = 10_000n;
    const absolute = micros < 0n ? -micros : micros;
    const whole = absolute / unit;
    const remainder = absolute % unit;
    const doubled = remainder * 2n;
    const increments =
      (this.mode === 'UP' && remainder > 0n) ||
      (this.mode === 'HALF_UP' && doubled >= unit) ||
      (this.mode === 'HALF_EVEN' && (doubled > unit || (doubled === unit && whole % 2n === 1n)));
    const rounded = (whole + (increments ? 1n : 0n)) * unit;
    return micros < 0n ? -rounded : rounded;
  }
}
