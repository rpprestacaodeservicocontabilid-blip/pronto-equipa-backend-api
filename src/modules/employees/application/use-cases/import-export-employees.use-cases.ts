import { ConflictError, ValidationError } from '../../../../shared/errors/app.error';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { CreateEmployeeInput } from '../../domain/entities/employee.entity';
import {
  EmployeeListQuery,
  EmployeeRepository,
} from '../../domain/repositories/employee.repository';
import { CreateEmployeeUseCase } from './create-employee.use-case';

export class ImportEmployeesUseCase {
  constructor(
    private readonly createEmployee: CreateEmployeeUseCase,
    private readonly audit: AuditRecorderPort,
  ) {}

  async execute(input: {
    companyId: number;
    actorUserId: number;
    employees: Omit<CreateEmployeeInput, 'companyId'>[];
  }) {
    const results = [];
    for (const [index, employee] of input.employees.entries()) {
      try {
        const created = await this.createEmployee.execute({
          ...employee,
          companyId: input.companyId,
          actorUserId: input.actorUserId,
        });
        results.push({
          index,
          employeeNumber: employee.employeeNumber,
          success: true,
          employeeId: created.id,
        });
      } catch (error) {
        if (!(error instanceof ConflictError || error instanceof ValidationError)) {
          throw error;
        }
        results.push({
          index,
          employeeNumber: employee.employeeNumber,
          success: false,
          error: error.message,
        });
      }
    }

    const succeeded = results.filter((result) => result.success).length;
    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'employee.imported',
      entityType: 'employee_import',
      after: { total: results.length, succeeded, failed: results.length - succeeded },
    });
    return {
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    };
  }
}

export class ExportEmployeesUseCase {
  constructor(
    private readonly repository: EmployeeRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async execute(input: { companyId: number; actorUserId: number; query: EmployeeListQuery }) {
    const result = await this.repository.list(input.companyId, input.query);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'employee.exported',
      entityType: 'employee_export',
      after: { page: input.query.page, count: result.data.length },
    });
    return {
      ...result,
      data: result.data.map((employee) => ({
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        firstName: employee.firstName,
        lastName: employee.lastName,
        admissionDate: employee.admissionDate,
        departmentId: employee.departmentId,
        jobTitle: employee.jobTitle,
        jobCategory: employee.jobCategory,
        status: employee.status,
      })),
    };
  }
}
