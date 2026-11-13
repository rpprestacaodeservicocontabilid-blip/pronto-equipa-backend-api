import { ValidationError } from '../../../../shared/errors/app.error';
import { Money } from '../value-objects/money.vo';

export interface RepaymentInstallment {
  number: number;
  dueDate: string;
  principalDue: string;
  interestDue: string;
  totalDue: string;
}

export class RepaymentPlanGenerator {
  generate(input: {
    principal: string;
    currency: string;
    installmentCount: number;
    firstDueDate: string;
    frequency: 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY';
    annualInterestBps: number;
  }): RepaymentInstallment[] {
    if (
      !Number.isInteger(input.installmentCount) ||
      input.installmentCount < 1 ||
      input.installmentCount > 120
    ) {
      throw new ValidationError('Installment count must be between 1 and 120.');
    }
    const firstDate = new Date(`${input.firstDueDate}T00:00:00.000Z`);
    if (
      Number.isNaN(firstDate.getTime()) ||
      firstDate.toISOString().slice(0, 10) !== input.firstDueDate
    ) {
      throw new ValidationError('A valid first installment date is required.');
    }
    if (
      !Number.isInteger(input.annualInterestBps) ||
      input.annualInterestBps < 0 ||
      input.annualInterestBps > 100_000
    ) {
      throw new ValidationError('Interest rate must be provided in basis points.');
    }
    const principal = Money.create(input.principal, input.currency);
    if (principal.cents === 0n) throw new ValidationError('Principal must be greater than zero.');

    const rate = BigInt(input.annualInterestBps);
    const totalInterest =
      (principal.cents * rate * BigInt(input.installmentCount) + 60_000n) / 120_000n;
    const basePrincipal = principal.cents / BigInt(input.installmentCount);
    const baseInterest = totalInterest / BigInt(input.installmentCount);
    let principalAllocated = 0n;
    let interestAllocated = 0n;

    return Array.from({ length: input.installmentCount }, (_, index) => {
      const last = index === input.installmentCount - 1;
      const principalDue = last ? principal.cents - principalAllocated : basePrincipal;
      const interestDue = last ? totalInterest - interestAllocated : baseInterest;
      principalAllocated += principalDue;
      interestAllocated += interestDue;

      const dueDate = new Date(firstDate);
      if (input.frequency === 'MONTHLY') {
        const targetMonth = firstDate.getUTCMonth() + index;
        dueDate.setUTCDate(1);
        dueDate.setUTCMonth(targetMonth);
        const lastDay = new Date(
          Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth() + 1, 0),
        ).getUTCDate();
        dueDate.setUTCDate(Math.min(firstDate.getUTCDate(), lastDay));
      } else {
        dueDate.setUTCDate(
          dueDate.getUTCDate() + index * (input.frequency === 'BIWEEKLY' ? 14 : 7),
        );
      }
      const money = (cents: bigint): string => Money.fromCents(cents, input.currency).toString();

      return {
        number: index + 1,
        dueDate: dueDate.toISOString().slice(0, 10),
        principalDue: money(principalDue),
        interestDue: money(interestDue),
        totalDue: money(principalDue + interestDue),
      };
    });
  }
}
