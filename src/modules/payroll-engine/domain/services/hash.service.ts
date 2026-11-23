import { createHash } from 'crypto';
import type { PayrollEngineInput, PayrollEngineResult } from '../contracts/payroll-engine.contract';

export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: unknown): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : stableSerialize(value))
    .digest('hex');
}

export function hashCalculationInput(input: Omit<PayrollEngineInput, 'inputHash' | 'calculationInputHash'>): string {
  return sha256(input);
}

export function hashCalculationResult(
  result: Omit<PayrollEngineResult, 'trace'>,
  trace: Omit<PayrollEngineResult['trace'], 'resultHash'>,
): string {
  return trace.hashVersion === 2 ? sha256({ result, trace }) : sha256(result);
}
