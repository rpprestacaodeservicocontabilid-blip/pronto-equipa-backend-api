import { RepaymentPlanGenerator } from '../../modules/loans/domain/services/repayment-plan-generator.service';
import { Money } from '../../modules/loans/domain/value-objects/money.vo';

describe('Loan money and repayment plans', () => {
  it('uses integer cents for money arithmetic', () => {
    const balance = Money.create('100.10', 'AOA');
    const payment = Money.create('0.01', 'AOA');
    expect(balance.subtract(payment).toString()).toBe('100.09');
    expect(() => Money.create('100.001', 'AOA')).toThrow();
  });

  it('allocates every cent and clamps monthly dates at month end', () => {
    const plan = new RepaymentPlanGenerator().generate({
      principal: '100.01',
      currency: 'AOA',
      installmentCount: 3,
      firstDueDate: '2024-01-31',
      frequency: 'MONTHLY',
      annualInterestBps: 0,
    });

    expect(plan.map((installment) => installment.dueDate)).toEqual([
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
    ]);
    expect(
      plan.reduce(
        (total, installment) => total + Money.create(installment.principalDue, 'AOA').cents,
        0n,
      ),
    ).toBe(10001n);
    expect(plan[2].principalDue).toBe('33.35');
  });

  it('calculates interest only when explicitly supplied', () => {
    const generator = new RepaymentPlanGenerator();
    const noInterest = generator.generate({
      principal: '1200.00',
      currency: 'AOA',
      installmentCount: 12,
      firstDueDate: '2026-01-31',
      frequency: 'MONTHLY',
      annualInterestBps: 0,
    });
    const withInterest = generator.generate({
      principal: '1200.00',
      currency: 'AOA',
      installmentCount: 12,
      firstDueDate: '2026-01-31',
      frequency: 'MONTHLY',
      annualInterestBps: 1200,
    });

    expect(
      noInterest.reduce(
        (total, installment) => total + Money.create(installment.interestDue, 'AOA').cents,
        0n,
      ),
    ).toBe(0n);
    expect(
      withInterest.reduce(
        (total, installment) => total + Money.create(installment.interestDue, 'AOA').cents,
        0n,
      ),
    ).toBe(14400n);
  });
});
