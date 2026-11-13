import { randomUUID } from 'crypto';
import { EmployeeNumber } from '../value-objects/employee-number.vo';
import { EmployeeStatus } from '../value-objects/employee-status.vo';
import { EmploymentDate } from '../value-objects/employment-date.vo';
import { PersonalName } from '../value-objects/personal-name.vo';

export interface CreateEmployeeInput {
  id?: string;
  companyId: number;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  nationality?: string | null;
  email?: string | null;
  phone?: string | null;
  admissionDate: string;
  departmentId?: number | null;
  jobTitle?: string | null;
  jobCategory?: string | null;
  status?: string;
}

export class EmployeeEntity {
  readonly id: string;
  readonly companyId: number;
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: Date | null;
  readonly nationality: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly admissionDate: Date;
  readonly departmentId: number | null;
  readonly jobTitle: string | null;
  readonly jobCategory: string | null;
  readonly status: string;

  private constructor(input: CreateEmployeeInput) {
    if (!Number.isSafeInteger(input.companyId) || input.companyId <= 0) {
      throw new Error('A valid company ID is required.');
    }

    this.id = input.id ?? randomUUID();
    this.companyId = input.companyId;
    this.employeeNumber = EmployeeNumber.create(input.employeeNumber).value;
    this.firstName = PersonalName.create(input.firstName, 'First name').value;
    this.lastName = PersonalName.create(input.lastName, 'Last name').value;
    this.dateOfBirth = input.dateOfBirth
      ? EmploymentDate.create(input.dateOfBirth, 'Date of birth').value
      : null;
    this.nationality = input.nationality?.trim() || null;
    this.email = input.email?.trim().toLowerCase() || null;
    this.phone = input.phone?.trim() || null;
    this.admissionDate = EmploymentDate.create(input.admissionDate, 'Admission date').value;
    this.departmentId = input.departmentId ?? null;
    this.jobTitle = input.jobTitle?.trim() || null;
    this.jobCategory = input.jobCategory?.trim() || null;
    this.status = EmployeeStatus.from(input.status ?? 'ACTIVE').value;
  }

  static create(input: CreateEmployeeInput): EmployeeEntity {
    return new EmployeeEntity(input);
  }
}
