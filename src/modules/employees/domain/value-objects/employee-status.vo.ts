export const EMPLOYEE_STATUSES = ['ACTIVE', 'SUSPENDED', 'ON_LEAVE', 'TERMINATED'] as const;

export type EmployeeStatusValue = (typeof EMPLOYEE_STATUSES)[number];

const TRANSITIONS: Readonly<Record<EmployeeStatusValue, readonly EmployeeStatusValue[]>> = {
  ACTIVE: ['SUSPENDED', 'ON_LEAVE', 'TERMINATED'],
  SUSPENDED: ['ACTIVE', 'ON_LEAVE', 'TERMINATED'],
  ON_LEAVE: ['ACTIVE', 'SUSPENDED', 'TERMINATED'],
  TERMINATED: ['ACTIVE'],
};

export class EmployeeStatus {
  private constructor(readonly value: EmployeeStatusValue) {}

  static from(value: string): EmployeeStatus {
    const normalized = value.toUpperCase() as EmployeeStatusValue;
    if (!EMPLOYEE_STATUSES.includes(normalized)) {
      throw new Error(`Invalid employee status: ${value}.`);
    }

    return new EmployeeStatus(normalized);
  }

  canTransitionTo(next: EmployeeStatus): boolean {
    return TRANSITIONS[this.value].includes(next.value);
  }

  equals(other: EmployeeStatus): boolean {
    return this.value === other.value;
  }
}
