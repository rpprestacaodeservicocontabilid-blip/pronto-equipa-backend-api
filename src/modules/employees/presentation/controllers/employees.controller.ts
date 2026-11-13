import { Request, Response } from 'express';
import { CreateEmployeeUseCase } from '../../application/use-cases/create-employee.use-case';
import { GetEmployeeHistoryUseCase } from '../../application/use-cases/get-employee-history.use-case';
import { GetEmployeeUseCase } from '../../application/use-cases/get-employee.use-case';
import { ListEmployeesUseCase } from '../../application/use-cases/list-employees.use-case';
import { ChangeEmployeeStatusUseCase } from '../../application/use-cases/change-employee-status.use-case';
import { TransferEmployeeUseCase } from '../../application/use-cases/transfer-employee.use-case';
import { UpdateEmployeeUseCase } from '../../application/use-cases/update-employee.use-case';
import {
  AddEmployeeDependentUseCase,
  GetEmployeeBankAccountUseCase,
  ListEmployeeDependentsUseCase,
  SetEmployeeBankAccountUseCase,
} from '../../application/use-cases/manage-employee-details.use-cases';
import {
  ExportEmployeesUseCase,
  ImportEmployeesUseCase,
} from '../../application/use-cases/import-export-employees.use-cases';
import {
  ChangeEmployeeStatusDto,
  CreateEmployeeDto,
  ListEmployeesDto,
  TransferEmployeeDto,
  UpdateEmployeeDto,
  UpdateEmployeePersonalInfoDto,
  AddEmployeeDependentDto,
  EmployeeBankAccountDto,
  ExportEmployeesDto,
  ImportEmployeesDto,
} from '../schemas/employee.schema';

export class EmployeesController {
  constructor(
    private readonly createEmployee: CreateEmployeeUseCase,
    private readonly listEmployees: ListEmployeesUseCase,
    private readonly getEmployee: GetEmployeeUseCase,
    private readonly updateEmployee: UpdateEmployeeUseCase,
    private readonly changeStatus: ChangeEmployeeStatusUseCase,
    private readonly transferEmployee: TransferEmployeeUseCase,
    private readonly getHistory: GetEmployeeHistoryUseCase,
    private readonly listDependents: ListEmployeeDependentsUseCase,
    private readonly addDependent: AddEmployeeDependentUseCase,
    private readonly getBankAccount: GetEmployeeBankAccountUseCase,
    private readonly setBankAccount: SetEmployeeBankAccountUseCase,
    private readonly importEmployees: ImportEmployeesUseCase,
    private readonly exportEmployees: ExportEmployeesUseCase,
  ) {}

  async list(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const query = req.query as unknown as ListEmployeesDto;
    const result = await this.listEmployees.execute(companyId, query);
    res.status(200).json({
      success: true,
      ...result,
      data: result.data.map((employee) => this.presentEmployee(employee)),
    });
  }

  async create(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    const actorUserId = req.user?.userId;
    if (!companyId) return;
    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const body = req.body as CreateEmployeeDto;
    const employee = await this.createEmployee.execute({
      ...body,
      companyId,
      actorUserId,
    });
    res.status(201).json({ success: true, data: this.presentEmployee(employee) });
  }

  async get(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const employee = await this.getEmployee.execute(companyId, req.params.id);
    res.status(200).json({ success: true, data: this.presentEmployee(employee) });
  }

  async getPersonalInfo(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const employee = await this.getEmployee.execute(companyId, req.params.id);
    res.status(200).json({
      success: true,
      data: {
        dateOfBirth: employee.dateOfBirth,
        nationality: employee.nationality,
        email: employee.email,
        phone: employee.phone,
      },
    });
  }

  async update(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    const actorUserId = req.user?.userId;
    if (!companyId) return;
    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }
    const body = req.body as UpdateEmployeeDto;
    const employee = await this.updateEmployee.execute({
      companyId,
      employeeId: req.params.id,
      actorUserId,
      changes: { ...body },
    });
    res.status(200).json({ success: true, data: this.presentEmployee(employee) });
  }

  async updatePersonalInfo(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    const actorUserId = req.user?.userId;
    if (!companyId) return;
    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const body = req.body as UpdateEmployeePersonalInfoDto;
    const employee = await this.updateEmployee.execute({
      companyId,
      employeeId: req.params.id,
      actorUserId,
      changes: {
        ...body,
        dateOfBirth:
          body.dateOfBirth == null
            ? body.dateOfBirth
            : new Date(`${body.dateOfBirth}T00:00:00.000Z`),
      },
    });
    res.status(200).json({
      success: true,
      data: {
        dateOfBirth: employee.dateOfBirth,
        nationality: employee.nationality,
        email: employee.email,
        phone: employee.phone,
      },
    });
  }

  async changeEmployeeStatus(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    const actorUserId = req.user?.userId;
    if (!companyId) return;
    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }
    const body = req.body as ChangeEmployeeStatusDto;
    const employee = await this.changeStatus.execute({
      ...body,
      companyId,
      employeeId: req.params.id,
      actorUserId,
      effectiveAt: new Date(`${body.effectiveAt}T00:00:00.000Z`),
    });
    res.status(200).json({ success: true, data: this.presentEmployee(employee) });
  }

  async transfer(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    const actorUserId = req.user?.userId;
    if (!companyId) return;
    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }
    const body = req.body as TransferEmployeeDto;
    const result = await this.transferEmployee.execute({
      ...body,
      companyId,
      employeeId: req.params.id,
      actorUserId,
      effectiveFrom: new Date(`${body.effectiveFrom}T00:00:00.000Z`),
    });
    res.status(201).json({ success: true, data: result });
  }

  async history(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const history = await this.getHistory.execute(companyId, req.params.id);
    res.status(200).json({ success: true, data: history });
  }

  async dependents(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    const data = await this.listDependents.execute(companyId, req.params.id);
    res.status(200).json({ success: true, data });
  }

  async addEmployeeDependent(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    const actorUserId = req.user?.userId;
    if (!companyId) return;
    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }
    const body = req.body as AddEmployeeDependentDto;
    const data = await this.addDependent.execute({
      ...body,
      companyId,
      employeeId: req.params.id,
      actorUserId,
      dateOfBirth: body.dateOfBirth == null ? null : new Date(`${body.dateOfBirth}T00:00:00.000Z`),
    });
    res.status(201).json({ success: true, data });
  }

  async employeeBankAccount(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (!companyId) return;
    await this.getEmployee.execute(companyId, req.params.id);
    const data = await this.getBankAccount.execute(companyId, req.params.id);
    res.status(200).json({ success: true, data });
  }

  async updateEmployeeBankAccount(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    const actorUserId = req.user?.userId;
    if (!companyId) return;
    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }
    const body = req.body as EmployeeBankAccountDto;
    const result = await this.setBankAccount.execute({
      ...body,
      companyId,
      employeeId: req.params.id,
      actorUserId,
      iban: body.iban ?? null,
    });
    res.status(200).json({ success: true, data: result });
  }

  async import(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    const actorUserId = req.user?.userId;
    if (!companyId) return;
    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const body = req.body as ImportEmployeesDto;
    const result = await this.importEmployees.execute({
      companyId,
      actorUserId,
      employees: body.employees,
    });
    res.status(200).json({ success: true, data: result });
  }

  async export(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    const actorUserId = req.user?.userId;
    if (!companyId) return;
    if (!actorUserId) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }

    const query = req.query as unknown as ExportEmployeesDto;
    const result = await this.exportEmployees.execute({
      companyId,
      actorUserId,
      query: {
        page: query.page,
        limit: query.limit,
        status: query.status,
        search: query.search,
      },
    });

    if (query.format === 'csv') {
      const fields = [
        'employeeNumber',
        'firstName',
        'lastName',
        'admissionDate',
        'departmentId',
        'jobTitle',
        'jobCategory',
        'status',
      ] as const;
      const rows = result.data.map((employee) =>
        fields.map((field) => this.csvCell(employee[field])).join(','),
      );
      res
        .status(200)
        .type('text/csv')
        .attachment('employees.csv')
        .send([fields.join(','), ...rows].join('\r\n'));
      return;
    }

    res.status(200).json({ success: true, ...result });
  }

  private companyId(res: Response): number | null {
    const companyId = res.req.tenant?.companyId;
    if (!companyId) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Company context is required.',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          timestamp: new Date().toISOString(),
        },
      });
      return null;
    }
    return companyId;
  }

  private presentEmployee(employee: Awaited<ReturnType<GetEmployeeUseCase['execute']>>) {
    return {
      id: employee.id,
      companyId: employee.companyId,
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      admissionDate: employee.admissionDate,
      departmentId: employee.departmentId,
      jobTitle: employee.jobTitle,
      jobCategory: employee.jobCategory,
      status: employee.status,
    };
  }

  private csvCell(value: string | number | Date | null): string {
    let text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
}
