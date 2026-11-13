import { ValidationError } from '../../../../shared/errors/app.error';

export const PUNCH_TYPES = ['IN', 'OUT', 'BREAK_START', 'BREAK_END'] as const;
export type PunchType = (typeof PUNCH_TYPES)[number];

export const parsePunchType = (value: string): PunchType => {
  if (!(PUNCH_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError('Unsupported attendance punch type.');
  }
  return value as PunchType;
};
