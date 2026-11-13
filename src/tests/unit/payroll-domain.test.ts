import {
  PayrollEmployeeResult,
  PayrollPeriod,
  PayrollRun,
} from '../../modules/payroll/domain/payroll';

describe('Payroll invariants', () => {
  test('validates real dates and period order', () => {
    expect(() => PayrollPeriod.validate('2026-02-30', '2026-03-01', '2026-03-02')).toThrow();
    expect(() => PayrollPeriod.validate('2026-03-02', '2026-03-01', '2026-03-02')).toThrow();
    expect(() => PayrollPeriod.validate('2026-02-01', '2026-02-28', '2026-03-01')).not.toThrow();
  });
  test('prevents destructive cancellation after approval or closure', () => {
    for (const status of ['PROCESSING', 'APPROVED', 'CLOSED'] as const)
      expect(() => PayrollRun.cancel(status)).toThrow();
    expect(PayrollRun.cancel('DRAFT')).toBe('CANCELLED');
  });
  test('rejects duplicate employees and contradictory scopes', () => {
    expect(() => PayrollRun.scope('COLLECTIVE', ['a', 'a'])).toThrow();
    expect(() => PayrollRun.scope('INDIVIDUAL', ['a', 'b'])).toThrow();
  });
  test('reconciles cents exactly without floating point arithmetic', () => {
    expect(() => PayrollEmployeeResult.reconcile('0.30', '0.10', '0.20')).not.toThrow();
    expect(() => PayrollEmployeeResult.reconcile('350000.00', '55000.00', '295000.01')).toThrow();
    expect(() => PayrollEmployeeResult.reconcile('10.00', '11.00', '-1.00')).toThrow();
  });
});
