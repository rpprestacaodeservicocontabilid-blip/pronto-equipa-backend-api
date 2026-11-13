import { hash, validateCalculation } from '../../modules/payroll/domain/payroll-result';
import { randomUUID } from 'crypto';
describe('Payroll calculation evidence', () => {
  const result = { employeeId: randomUUID(), grossAmount: '100.00', deductionsAmount: '10.00', netAmount: '90.00', employerCostsAmount: '0.00', currency: 'AOA', engineVersion: 'fixture', legalRuleSetVersion: 'fixture', calculationTraceId: 'fixture', lines: [{ code: 'BASE', type: 'EARNING', amount: '100.00', sourceReference: 'contract' }, { code: 'DEDUCTION', type: 'DEDUCTION', amount: '10.00', sourceReference: 'rule' }] };
  test('rejects inconsistent engine totals', () => { expect(() => validateCalculation({ ...result, netAmount: '91.00' })).toThrow(); });
  test('rejects duplicate source lines', () => { expect(() => validateCalculation({ ...result, lines: [...result.lines, result.lines[0]] })).toThrow(); });
  test('requires legal and engine version evidence', () => { expect(() => validateCalculation({ ...result, legalRuleSetVersion: '' })).toThrow(); });
  test('snapshot hashes are stable across object key order', () => { expect(hash({ b: '2', a: { y: 2, x: 1 } })).toBe(hash({ a: { x: 1, y: 2 }, b: '2' })); });
});
