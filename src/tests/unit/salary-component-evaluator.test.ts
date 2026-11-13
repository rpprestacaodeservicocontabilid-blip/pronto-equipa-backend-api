import { SalaryComponentEvaluatorService } from '../../modules/salary-structure/domain/services/salary-component-evaluator.service';

describe('Salary component evaluator', () => {
  const evaluator = new SalaryComponentEvaluatorService();

  it('uses integer cents and rounds percentage values deterministically', () => {
    expect(
      evaluator.evaluate(
        {
          type: 'ALLOWANCE',
          method: 'PERCENTAGE',
          amount: null,
          percentage: '10',
          calculationConfig: {},
          sourceReference: null,
        },
        '100.05',
      ),
    ).toBe('10.01');
  });

  it('evaluates only the supported declarative formula', () => {
    expect(
      evaluator.evaluate(
        {
          type: 'ALLOWANCE',
          method: 'FORMULA',
          amount: null,
          percentage: null,
          calculationConfig: { operation: 'PERCENT_OF_BASE', percentage: '7.5' },
          sourceReference: null,
        },
        '1000.00',
      ),
    ).toBe('75.00');
    expect(() =>
      evaluator.evaluate(
        {
          type: 'ALLOWANCE',
          method: 'FORMULA',
          amount: null,
          percentage: null,
          calculationConfig: { operation: 'EVAL', expression: 'process.exit()' },
          sourceReference: null,
        },
        '1000.00',
      ),
    ).toThrow();
  });

  it('requires an authorized source reference for variable inputs', () => {
    expect(() =>
      evaluator.evaluate(
        {
          type: 'COMMISSION',
          method: 'VARIABLE_INPUT',
          amount: '50.00',
          percentage: null,
          calculationConfig: {},
          sourceReference: null,
        },
        '1000.00',
      ),
    ).toThrow();
  });
});
