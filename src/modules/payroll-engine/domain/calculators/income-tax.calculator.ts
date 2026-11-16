import { PayrollLegalRuleSet } from '../contracts/payroll-engine.contract';
import { Money, sumMoney } from '../value-objects/money.vo';

export class IncomeTaxCalculator {
  calculate(
    earningLines: Array<{ code: string; amount: Money }>,
    rules: PayrollLegalRuleSet['incomeTaxRules'],
    socialSecurity: Money,
    rounding: PayrollLegalRuleSet['roundingPolicy']['mode'],
  ) {
    const included = rules.includedComponentCodes;
    const excluded = new Set(rules.excludedComponentCodes ?? []);
    let base = sumMoney(
      earningLines
        .filter((line) => (included ? included.includes(line.code) : !excluded.has(line.code)))
        .map((line) => line.amount),
    );
    if (rules.socialSecurityDeductible) base = base.subtract(socialSecurity).max(Money.zero());
    const taxable = base
      .subtract(Money.parse(rules.exemptionAmount ?? '0'))
      .max(Money.zero())
      .round(rounding);
    const brackets = [...rules.brackets].sort((a, b) =>
      Money.parse(a.from).compare(Money.parse(b.from)),
    );
    let tax = Money.zero();
    if (rules.calculation === 'MARGINAL') {
      const bracket = brackets.find(
        (item) =>
          taxable.compare(Money.parse(item.from)) >= 0 &&
          (!item.to || taxable.compare(Money.parse(item.to)) <= 0),
      );
      if (bracket)
        tax = taxable
          .multiplyRate(bracket.rate)
          .subtract(Money.parse(bracket.deduction ?? '0'))
          .max(Money.zero());
    } else {
      for (const bracket of brackets) {
        const from = Money.parse(bracket.from);
        if (taxable.compare(from) <= 0) continue;
        const upper = bracket.to ? Money.parse(bracket.to).min(taxable) : taxable;
        const band = upper.subtract(from).max(Money.zero());
        tax = tax.add(band.multiplyRate(bracket.rate));
      }
    }
    return { base: base.round(rounding), taxable, tax: tax.round(rounding) };
  }
}
