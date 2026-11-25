import type { TransactionalAuditPort } from '../../../../audit/application/ports/audit-engine.ports';
import { withRecordTransaction } from '../../../../../shared/infrastructure/persistence/sequelize-record-store';
import { Op, QueryTypes, Transaction, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import { ConflictError, ForbiddenError, ValidationError } from '../../../../../shared/errors/app.error';
import { EmployeeEntity } from '../../../domain/entities/employee.entity';
import { EmployeeStatus } from '../../../domain/value-objects/employee-status.vo';
import {
  EmployeeListQuery,
  EmployeeProfessionalHistory,
  EmployeeRepository,
  EmployeeSnapshot,
  EmployeeStatusHistory,
} from '../../../domain/repositories/employee.repository';
import { EmployeeModel } from '../models/employee.model';
import { EmployeeProfessionalHistoryModel } from '../models/employee-professional-history.model';
import { EmployeeStatusHistoryModel } from '../models/employee-status-history.model';

type EmployeeRow = EmployeeModel;

const dateOnly = (value: Date | string): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

const asUtcDate = (value: Date | string): Date => new Date(`${dateOnly(value)}T00:00:00.000Z`);

const mapEmployee = (row: EmployeeRow): EmployeeEntity =>
  EmployeeEntity.create({
    id: row.id,
    companyId: row.companyId,
    employeeNumber: row.employeeNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: row.dateOfBirth ? dateOnly(row.dateOfBirth) : null,
    nationality: row.nationality,
    email: row.email,
    phone: row.phone,
    admissionDate: dateOnly(row.admissionDate),
    departmentId: row.departmentId,
    jobTitle: row.jobTitle,
    jobCategory: row.jobCategory,
    status: row.status,
  });

export const inTenantTransaction = async <T>(
  companyId: number,
  operation: (transaction: Transaction) => Promise<T>,
): Promise<T> =>
  sequelize.transaction(async (transaction) => {
    if (sequelize.getDialect() === 'postgres') {
      await sequelize.query("SELECT set_config('app.current_tenant', :companyId, true)", {
        replacements: { companyId: String(companyId) },
        type: QueryTypes.SELECT,
        transaction,
      });
    }

    return operation(transaction);
  });

export class SequelizeEmployeeRepository implements EmployeeRepository {
  constructor(private readonly audit: TransactionalAuditPort) {}

  async create(employee: EmployeeEntity, actorUserId: number, outerTransaction?: Transaction): Promise<EmployeeEntity> {
    const persist = async (transaction: Transaction) => {
      const duplicate = await EmployeeModel.findOne({
        where: {
          companyId: employee.companyId,
          employeeNumber: employee.employeeNumber,
        },
        transaction,
      });
      if (duplicate) {
        throw new ConflictError('Employee number already exists in this company.');
      }

      const now = new Date();
      let row: EmployeeModel;
      try {
        row = await EmployeeModel.create(
          {
            id: employee.id,
            companyId: employee.companyId,
            employeeNumber: employee.employeeNumber,
            firstName: employee.firstName,
            lastName: employee.lastName,
            dateOfBirth: employee.dateOfBirth,
            nationality: employee.nationality,
            email: employee.email,
            phone: employee.phone,
            admissionDate: employee.admissionDate,
            departmentId: employee.departmentId,
            jobTitle: employee.jobTitle,
            jobCategory: employee.jobCategory,
            status: 'ACTIVE',
            terminationDate: null,
            terminationReason: null,
            createdAt: now,
            updatedAt: now,
          },
          { transaction },
        );
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          throw new ConflictError('Employee number already exists in this company.');
        }
        throw error;
      }

      await EmployeeStatusHistoryModel.create(
        {
          companyId: employee.companyId,
          employeeId: employee.id,
          fromStatus: null,
          toStatus: 'ACTIVE',
          effectiveAt: employee.admissionDate,
          reason: 'Employee registered.',
          actorUserId,
          createdAt: now,
        },
        { transaction },
      );

      await EmployeeProfessionalHistoryModel.create(
        {
          companyId: employee.companyId,
          employeeId: employee.id,
          departmentId: employee.departmentId,
          jobTitle: employee.jobTitle,
          jobCategory: employee.jobCategory,
          effectiveFrom: employee.admissionDate,
          effectiveTo: null,
          reason: 'Initial professional record.',
          changedBy: actorUserId,
          createdAt: now,
        },
        { transaction },
      );

      return mapEmployee(row);
    };
    return outerTransaction ? persist(outerTransaction) : inTenantTransaction(employee.companyId, persist);
  }

  async findById(companyId: number, employeeId: string): Promise<EmployeeEntity | null> {
    return inTenantTransaction(companyId, async (transaction) => {
      const row = await EmployeeModel.findOne({
        where: { id: employeeId, companyId },
        transaction,
      });
      return row ? mapEmployee(row) : null;
    });
  }

  async list(companyId: number, query: EmployeeListQuery) {
    return inTenantTransaction(companyId, async (transaction) => {
      const where: Record<string | symbol, unknown> = { companyId };
      if (query.status) where.status = query.status;
      if (query.departmentId) where.departmentId = query.departmentId;
      if (query.admittedFrom || query.admittedTo) {
        where.admissionDate = {
          ...(query.admittedFrom ? { [Op.gte]: query.admittedFrom } : {}),
          ...(query.admittedTo ? { [Op.lte]: query.admittedTo } : {}),
        };
      }
      if (query.search) {
        where[Op.or] = [
          { employeeNumber: { [Op.like]: `%${query.search}%` } },
          { firstName: { [Op.like]: `%${query.search}%` } },
          { lastName: { [Op.like]: `%${query.search}%` } },
          { email: { [Op.like]: `%${query.search}%` } },
        ];
      }

      const offset = (query.page - 1) * query.limit;
      const result = await EmployeeModel.findAndCountAll({
        where,
        limit: query.limit,
        offset,
        order: [
          ...(query.sort === 'admission-desc' ? [['admissionDate', 'DESC'] as [string, string]] : []),
          ['lastName', 'ASC'],
          ['firstName', 'ASC'],
          ['id', 'ASC'],
        ],
        transaction,
      });

      return {
        data: result.rows.map(mapEmployee),
        pagination: {
          page: query.page,
          limit: query.limit,
          total: result.count,
          totalPages: Math.ceil(result.count / query.limit),
        },
      };
    });
  }

  async update(
    companyId: number,
    employeeId: string,
    changes: Partial<
      Pick<
        EmployeeEntity,
        'firstName' | 'lastName' | 'dateOfBirth' | 'nationality' | 'email' | 'phone'
      >
    >,
    _actorUserId: number,
  ): Promise<EmployeeEntity | null> {
    return inTenantTransaction(companyId, async (transaction) => {
      const row = await EmployeeModel.findOne({
        where: { id: employeeId, companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) return null;

      row.set({
        firstName: changes.firstName ?? row.firstName,
        lastName: changes.lastName ?? row.lastName,
        dateOfBirth: changes.dateOfBirth ?? row.dateOfBirth,
        nationality: changes.nationality ?? row.nationality,
        email: changes.email ?? row.email,
        phone: changes.phone ?? row.phone,
        updatedAt: new Date(),
      });
      await row.save({ transaction });
      return mapEmployee(row);
    });
  }

  async changeStatus(input: {
    companyId: number;
    employeeId: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'ON_LEAVE' | 'TERMINATED';
    effectiveAt: Date;
    reason: string;
    actorUserId: number;
    operation?: 'status' | 'termination' | 'rehire';
    terminationReason?: string;
  }): Promise<EmployeeEntity | null> {
    return inTenantTransaction(input.companyId, async (transaction) => {
      const row = await EmployeeModel.findOne({
        where: { id: input.employeeId, companyId: input.companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) return null;

      const from = EmployeeStatus.from(row.status);
      const to = EmployeeStatus.from(input.status);
      const requiredOperation = to.value === 'TERMINATED' ? 'termination'
        : from.value === 'TERMINATED' && to.value === 'ACTIVE' ? 'rehire' : 'status';
      if ((input.operation ?? 'status') !== requiredOperation) {
        throw new ForbiddenError('This transition requires its dedicated employee operation.');
      }
      if (!from.canTransitionTo(to)) {
        throw new ValidationError(
          `Employee status cannot change from ${from.value} to ${to.value}.`,
        );
      }
      if (input.effectiveAt < asUtcDate(row.admissionDate)) {
        throw new ValidationError('Status effective date cannot precede the admission date.');
      }
      if (input.effectiveAt > new Date(new Date().toISOString().slice(0, 10))) {
        throw new ValidationError('Future-dated status changes are not supported.');
      }
      if (to.value === 'TERMINATED' && !input.terminationReason?.trim()) {
        throw new ValidationError('A termination reason is required.');
      }
      if (
        from.value === 'TERMINATED' &&
        to.value === 'ACTIVE' &&
        row.terminationDate &&
        input.effectiveAt <= asUtcDate(row.terminationDate)
      ) {
        throw new ValidationError('A rehire date must be after the previous termination date.');
      }

      const latestStatus = await EmployeeStatusHistoryModel.findOne({
        where: { companyId: input.companyId, employeeId: input.employeeId },
        order: [
          ['effectiveAt', 'DESC'],
          ['id', 'DESC'],
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (latestStatus && input.effectiveAt <= latestStatus.effectiveAt) {
        throw new ValidationError('Status history cannot be changed retroactively.');
      }

      const now = new Date();
      row.set({
        status: to.value,
        terminationDate: to.value === 'TERMINATED' ? input.effectiveAt : null,
        terminationReason: to.value === 'TERMINATED' ? input.terminationReason!.trim() : null,
        updatedAt: now,
      });
      await row.save({ transaction });

      const history = await EmployeeStatusHistoryModel.create(
        {
          companyId: input.companyId,
          employeeId: input.employeeId,
          fromStatus: from.value,
          toStatus: to.value,
          effectiveAt: input.effectiveAt,
          reason: input.reason.trim(),
          actorUserId: input.actorUserId,
          createdAt: now,
        },
        { transaction },
      );
      const action = requiredOperation === 'termination' ? 'employee.terminated'
        : requiredOperation === 'rehire' ? 'employee.rehired' : 'employee.status.changed';
      await withRecordTransaction(transaction, input.companyId, context => this.audit.append({
        eventId: 'employee-status-' + history.id,
        eventType: action, action, module: 'employees', sourceId: 'employees',
        category: 'ACTIVITY', severity: 'MEDIUM', scope: 'TENANT', tenantId: String(input.companyId),
        resource: { resourceType: 'employee', resourceId: input.employeeId },
        actor: { actorType: 'USER', actorId: String(input.actorUserId) },
        changes: [{ field: 'status', before: from.value, after: to.value }],
        metadata: { effectiveAt: input.effectiveAt.toISOString() },
        outcome: 'SUCCESS', occurredAt: now.toISOString(),
      }, context));
      return mapEmployee(row);
    });
  }

  async transfer(input: {
    companyId: number;
    employeeId: string;
    departmentId: number | null;
    jobTitle: string | null;
    jobCategory: string | null;
    effectiveFrom: Date;
    reason: string;
    actorUserId: number;
  }): Promise<EmployeeProfessionalHistory | null> {
    return inTenantTransaction(input.companyId, async (transaction) => {
      const row = await EmployeeModel.findOne({
        where: { id: input.employeeId, companyId: input.companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row) return null;
      if (row.status === 'TERMINATED') {
        throw new ValidationError('A terminated employee cannot be transferred.');
      }
      if (input.effectiveFrom < asUtcDate(row.admissionDate)) {
        throw new ValidationError('Professional effective date cannot precede the admission date.');
      }
      if (input.effectiveFrom > new Date(new Date().toISOString().slice(0, 10))) {
        throw new ValidationError('Future-dated professional changes are not supported.');
      }

      const current = await EmployeeProfessionalHistoryModel.findOne({
        where: {
          companyId: input.companyId,
          employeeId: input.employeeId,
          effectiveTo: null,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const currentFrom = current ? asUtcDate(current.effectiveFrom) : null;
      if (!current || (currentFrom && input.effectiveFrom <= currentFrom)) {
        throw new ValidationError('Professional history periods cannot overlap or be backdated.');
      }

      const now = new Date();
      current.effectiveTo = new Date(input.effectiveFrom.getTime() - 24 * 60 * 60 * 1000);
      await current.save({ transaction });

      const history = await EmployeeProfessionalHistoryModel.create(
        {
          companyId: input.companyId,
          employeeId: input.employeeId,
          departmentId: input.departmentId,
          jobTitle: input.jobTitle,
          jobCategory: input.jobCategory,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: null,
          reason: input.reason.trim(),
          changedBy: input.actorUserId,
          createdAt: now,
        },
        { transaction },
      );
      row.set({
        departmentId: input.departmentId,
        jobTitle: input.jobTitle,
        jobCategory: input.jobCategory,
        updatedAt: now,
      });
      await row.save({ transaction });

      return this.toProfessionalHistory(history);
    });
  }

  async listHistory(companyId: number, employeeId: string) {
    return inTenantTransaction(companyId, async (transaction) => {
      const employeeExists = await EmployeeModel.findOne({
        where: { id: employeeId, companyId },
        attributes: ['id'],
        transaction,
      });
      if (!employeeExists) return null;

      const professionalRows = await EmployeeProfessionalHistoryModel.findAll({
        where: { companyId, employeeId },
        order: [['effectiveFrom', 'DESC']],
        transaction,
      });
      const statusRows = await EmployeeStatusHistoryModel.findAll({
        where: { companyId, employeeId },
        order: [
          ['effectiveAt', 'DESC'],
          ['id', 'DESC'],
        ],
        transaction,
      });

      return {
        professional: professionalRows.map((row) => this.toProfessionalHistory(row)),
        status: statusRows.map((row) => this.toStatusHistory(row)),
      };
    });
  }

  async snapshotAsOf(
    companyId: number,
    employeeId: string,
    asOf: Date,
  ): Promise<EmployeeSnapshot | null> {
    return inTenantTransaction(companyId, async (transaction) => {
      const employee = await EmployeeModel.findOne({
        where: { id: employeeId, companyId },
        transaction,
      });
      if (!employee) return null;

      const referenceDate = asUtcDate(asOf);
      const endOfDay = new Date(referenceDate.getTime() + 24 * 60 * 60 * 1000 - 1);
      const [professional, status] = await Promise.all([
        EmployeeProfessionalHistoryModel.findOne({
          where: {
            companyId,
            employeeId,
            effectiveFrom: { [Op.lte]: referenceDate },
            [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: referenceDate } }],
          },
          order: [['effectiveFrom', 'DESC']],
          transaction,
        }),
        EmployeeStatusHistoryModel.findOne({
          where: {
            companyId,
            employeeId,
            effectiveAt: { [Op.lte]: endOfDay },
          },
          order: [
            ['effectiveAt', 'DESC'],
            ['id', 'DESC'],
          ],
          transaction,
        }),
      ]);

      if (!professional || !status) return null;
      return {
        employeeId,
        companyId,
        employeeNumber: employee.employeeNumber,
        status: EmployeeStatus.from(status.toStatus).value,
        departmentId: professional.departmentId,
        jobTitle: professional.jobTitle,
        jobCategory: professional.jobCategory,
        effectiveAt: referenceDate,
      };
    });
  }

  private toProfessionalHistory(
    row: EmployeeProfessionalHistoryModel,
  ): EmployeeProfessionalHistory {
    return {
      id: row.id,
      companyId: row.companyId,
      employeeId: row.employeeId,
      departmentId: row.departmentId,
      jobTitle: row.jobTitle,
      jobCategory: row.jobCategory,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      reason: row.reason,
      createdAt: row.createdAt,
    };
  }

  private toStatusHistory(row: EmployeeStatusHistoryModel): EmployeeStatusHistory {
    return {
      id: row.id,
      companyId: row.companyId,
      employeeId: row.employeeId,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      effectiveAt: row.effectiveAt,
      reason: row.reason,
      actorUserId: row.actorUserId,
      createdAt: row.createdAt,
    };
  }
}
