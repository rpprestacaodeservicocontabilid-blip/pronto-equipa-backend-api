import { PayrollLegalRuleSet } from '../contracts/payroll-engine.contract';
import { Money, sumMoney } from '../value-objects/money.vo';

export class SocialSecurityCalculator {
  calculate(gross: Money, earningLines: Array<{ code: string; amount: Money }>, rules: PayrollLegalRuleSet['socialSecurityRules'], rounding: PayrollLegalRuleSet['roundingPolicy']['mode']) {
    const included = rules.includedComponentCodes;
    const excluded = new Set(rules.excludedComponentCodes ?? []);
    const eligible = earningLines.filter((line) => included ? included.includes(line.code) : !excluded.has(line.code));
    let base = sumMoney(eligible.map((line) => line.amount));
    if (rules.minimumBase) base = base.max(Money.parse(rules.minimumBase));
    if (rules.maximumBase) base = base.min(Money.parse(rules.maximumBase));
    const employee = base.multiplyRate(rules.employeeRate).round(rounding);
    const employer = base.multiplyRate(rules.employerRate).round(rounding);
    return { base: base.round(rounding), employee, employer };
  }
}
