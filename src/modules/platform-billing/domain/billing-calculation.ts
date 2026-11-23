import { AppError } from '../../../shared/errors/app.error';

export const billingError = (message: string, statusCode = 422) =>
  new AppError(message, statusCode, 'BILLING_RULE_VIOLATION');
export function cents(value: string): bigint {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) throw billingError('Valor monetário inválido.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
}
export function amount(value: bigint): string {
  return `${value / BigInt(100)}.${String(value % BigInt(100)).padStart(2, '0')}`;
}
export interface BillingLine {
  description: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  taxBasisPoints: number;
  taxRuleVersion: string;
}
export function calculate(lines: BillingLine[]) {
  let net = BigInt(0),
    tax = BigInt(0);
  const calculated = lines.map((line) => {
    const gross = cents(line.unitPrice) * BigInt(line.quantity),
      discount = cents(line.discount);
    if (discount > gross) throw billingError('Desconto superior ao valor da linha.');
    const base = gross - discount;
    const lineTax = (base * BigInt(line.taxBasisPoints) + BigInt(5000)) / BigInt(10000);
    net += base;
    tax += lineTax;
    return { ...line, net: amount(base), tax: amount(lineTax), total: amount(base + lineTax) };
  });
  return { lines: calculated, net: amount(net), tax: amount(tax), total: amount(net + tax) };
}
