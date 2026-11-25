import { EmployeeEntity } from '../entities/employee.entity';
import { EmployeeStatusValue } from '../value-objects/employee-status.vo';

export interface EmployeeListQuery {
  page: number;
  limit: number;
  status?: EmployeeStatusValue;
  search?: string;
  admittedFrom?: string;
  admittedTo?: string;
  departmentId?: number;
  sort?: 'name' | 'admission-desc';
}

export interface EmployeeProfessionalHistory {
  id: number;
  companyId: number;
  employeeId: string;
  departmentId: number | null;
  jobTitle: string | null;
  jobCategory: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  reason: string | null;
  createdAt: Date;
}

export interface EmployeeStatusHistory {
  id: number;
  companyId: number;
  employeeId: string;
  fromStatus: string | null;
  toStatus: string;
  effectiveAt: Date;
  reason: string | null;
  actorUserId: number | null;
  createdAt: Date;
}

export interface EmployeeSnapshot {
  employeeId: string;
  companyId: number;
  employeeNumber: string;
  status: EmployeeStatusValue;
  departmentId: number | null;
  jobTitle: string | null;
  jobCategory: string | null;
  effectiveAt: Date;
}

export interface EmployeeRepository {
  create(employee: EmployeeEntity, actorUserId: number): Promise<EmployeeEntity>;
  findById(companyId: number, employeeId: string): Promise<EmployeeEntity | null>;
  list(
    companyId: number,
    query: EmployeeListQuery,
  ): Promise<{
    data: EmployeeEntity[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>;
  update(
    companyId: number,
    employeeId: string,
    changes: Partial<
      Pick<
        EmployeeEntity,
        'firstName' | 'lastName' | 'dateOfBirth' | 'nationality' | 'email' | 'phone'
      >
    >,
    actorUserId: number,
  ): Promise<EmployeeEntity | null>;
  changeStatus(input: {
    companyId: number;
    employeeId: string;
    status: EmployeeStatusValue;
    effectiveAt: Date;
    reason: string;
    actorUserId: number;
    operation?: 'status' | 'termination' | 'rehire';
    terminationReason?: string;
  }): Promise<EmployeeEntity | null>;
  transfer(input: {
    companyId: number;
    employeeId: string;
    departmentId: number | null;
    jobTitle: string | null;
    jobCategory: string | null;
    effectiveFrom: Date;
    reason: string;
    actorUserId: number;
  }): Promise<EmployeeProfessionalHistory | null>;
  listHistory(
    companyId: number,
    employeeId: string,
  ): Promise<{
    professional: EmployeeProfessionalHistory[];
    status: EmployeeStatusHistory[];
  } | null>;
  snapshotAsOf(companyId: number, employeeId: string, asOf: Date): Promise<EmployeeSnapshot | null>;
}
