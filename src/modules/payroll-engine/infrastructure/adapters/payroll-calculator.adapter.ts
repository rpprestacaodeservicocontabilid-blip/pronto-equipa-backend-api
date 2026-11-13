import { PayrollCalculatorPort as PayrollWorkflowCalculatorPort, PayrollInputSnapshot, PayrollCalculationResult } from '../../../payroll/application/ports/payroll-calculator.port';
import { PayrollEngineError } from '../../domain/errors/payroll-engine.error';
import { PayrollEngineInput, PayrollLegalRuleSet } from '../../domain/contracts/payroll-engine.contract';
import { PayrollCalculationService } from '../../domain/services/payroll-calculation.service';

const record = (value: unknown, name: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PayrollEngineError(`Invalid ${name} snapshot.`, 'INVALID_INPUT');
  return value as Record<string, unknown>;
};

const text = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new PayrollEngineError(`Missing ${name}.`, 'INVALID_INPUT');
  return value;
};

export class PayrollCalculatorAdapter implements PayrollWorkflowCalculatorPort {
  constructor(private readonly engine = new PayrollCalculationService(), private readonly engineVersion = '1.0.0') {}

  async calculate(snapshot: PayrollInputSnapshot): Promise<PayrollCalculationResult> {
    const data = record(snapshot.data, 'payroll input');
    const engineData = data.engineInput ? record(data.engineInput, 'engine input') : {};
    const legal = record(engineData.legalRules ?? data.legalRules, 'legal rules') as unknown as PayrollLegalRuleSet;
    const segments = Array.isArray(engineData.segments) ? engineData.segments as PayrollEngineInput['segments'] : this.resolveSalarySegments(data);
    const currency = String(engineData.currency ?? this.resolveCurrency(data));
    if (currency !== 'AOA') throw new PayrollEngineError('Payroll engine only accepts AOA calculation snapshots.', 'INVALID_CURRENCY');
    const input: PayrollEngineInput = {
      tenantId: snapshot.companyId,
      employeeId: snapshot.employeeId,
      payrollRunId: snapshot.payrollRunId,
      period: snapshot.period,
      currency: 'AOA',
      engineVersion: String(engineData.engineVersion ?? this.engineVersion),
      inputHash: snapshot.inputHash,
      legalRules: legal,
      expectedLegalRuleSetVersion: snapshot.legalRuleSetVersion,
      segments,
      ...(engineData.attendance ? { attendance: engineData.attendance as PayrollEngineInput['attendance'] } : {}),
      deductions: [
        ...((engineData.deductions as PayrollEngineInput['deductions']) ?? []),
        ...this.resolveLoanDeductions(data),
      ],
      ...(Array.isArray(engineData.leave) ? { leave: engineData.leave as PayrollEngineInput['leave'] } : {}),
    };
    const result = this.engine.calculate(input);
    return {
      employeeId: result.employeeId,
      grossAmount: result.grossAmount,
      deductionsAmount: result.totalDeductions,
      netAmount: result.netAmount,
      employerCostsAmount: result.employerCostsAmount,
      currency: result.currency,
      engineVersion: result.trace.engineVersion,
      legalRuleSetVersion: result.trace.legalRuleSetVersion,
      calculationTraceId: result.trace.calculationTraceId,
      issues: result.issues,
      calculationTrace: result.trace as unknown as Record<string, unknown>,
      lines: result.lines,
    };
  }

  private resolveSalarySegments(data: Record<string, unknown>): PayrollEngineInput['segments'] {
    if (!Array.isArray(data.segments)) throw new PayrollEngineError('Salary history segments are missing.', 'MISSING_SALARY');
    return data.segments.map((item) => {
      const segment = record(item, 'salary segment');
      const salary = record(segment.salary, 'salary');
      const resolved = salary.resolvedComponents;
      if (!Array.isArray(resolved)) throw new PayrollEngineError('Resolved salary components are missing.', 'MISSING_SALARY');
      let baseSalary: string | undefined;
      const components: PayrollEngineInput['segments'][number]['components'] = [];
      for (const raw of resolved) {
        const component = record(raw, 'salary component');
        const code = text(component.code, 'component code');
        const amount = text(component.amount, 'component amount');
        const type = String(component.type ?? '').toUpperCase();
        const frequency = String(component.frequency ?? 'MONTHLY').toUpperCase();
        if (!['MONTHLY', 'WEEKLY', 'BIWEEKLY', 'ANNUAL', 'ONE_TIME'].includes(frequency))
          throw new PayrollEngineError('Unsupported salary component frequency.', 'INVALID_COMPONENT_FREQUENCY');
        if (component.currency !== 'AOA') throw new PayrollEngineError('Every salary component must use AOA.', 'INVALID_CURRENCY');
        if (type === 'BASE_SALARY' || code === 'BASE_SALARY') { baseSalary = amount; continue; }
        const sourceReference = String(component.sourceReference ?? component.componentVersionId ?? component.sourceVersionId ?? `salary:${code}`);
        components.push({ code, amount, kind: type === 'DEDUCTION' ? 'DEDUCTION' : 'EARNING', sourceReference, frequency: frequency as PayrollEngineInput['segments'][number]['components'][number]['frequency'] });
      }
      if (!baseSalary) throw new PayrollEngineError('Base salary is missing from the resolved salary snapshot.', 'MISSING_SALARY');
      return {
        startDate: text(segment.startDate, 'salary segment start date'),
        endDate: text(segment.endDate, 'salary segment end date'),
        baseSalary,
        components,
      };
    });
  }

  private resolveCurrency(data: Record<string, unknown>): string {
    if (Array.isArray(data.segments)) {
      const segment = record(data.segments[0], 'salary segment');
      const salary = record(segment.salary, 'salary');
      const resolved = Array.isArray(salary.resolvedComponents) ? salary.resolvedComponents : [];
      const base = resolved.map((item) => record(item, 'salary component')).find((item) => item.type === 'BASE_SALARY');
      if (base && typeof base.currency === 'string') return base.currency;
      if (typeof salary.currency === 'string') return salary.currency;
    }
    const engineInput = data.engineInput ? record(data.engineInput, 'engine input') : {};
    if (typeof engineInput.currency === 'string') return engineInput.currency;
    throw new PayrollEngineError('Currency is not present in the salary snapshot.', 'INVALID_CURRENCY');
  }

  private resolveLoanDeductions(data: Record<string, unknown>): NonNullable<PayrollEngineInput['deductions']> {
    if (!Array.isArray(data.loanDeductions)) return [];
    return data.loanDeductions.map((item) => {
      const deduction = record(item, 'loan deduction');
      return {
        code: `LOAN_${text(deduction.id, 'loan deduction identifier')}`,
        requestedAmount: text(deduction.requestedAmount, 'loan deduction amount'),
        priority: Number.isInteger(deduction.priority) ? Number(deduction.priority) : 100,
        sourceReference: `loan-deduction:${String(deduction.id)}`,
        authorized: deduction.status === 'REQUESTED' && (deduction.payrollRunId == null || deduction.payrollRunId === data.payrollRunId),
        category: 'LOAN',
      };
    });
  }
}
