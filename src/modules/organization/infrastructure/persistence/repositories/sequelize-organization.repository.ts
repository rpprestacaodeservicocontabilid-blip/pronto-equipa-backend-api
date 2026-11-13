import { randomUUID } from 'crypto';
import { Op, QueryTypes, Transaction, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../../shared/errors/app.error';
import { EmployeeModel } from '../../../../employees/infrastructure/persistence/model/employee.model';
import { CompanyModel } from '../../../../tenancy/infrastructure/persistence/model/company.model';
import { OrganizationCode } from '../../../domain/value-objects/organization-code.vo';
import { AllocationPercentage } from '../../../domain/value-objects/allocation-percentage.vo';
import {
  OrganizationEntityType,
  OrganizationRecord,
  validateDateRange,
  validateHierarchy,
  validateScheduleShifts,
} from '../../../domain/services/organization-validation.service';
import {
  OrganizationRecordInput,
  OrganizationRepository,
} from '../../../domain/repositories/organization.repository';
import { OrganizationHistoryModel } from '../model/organization-history.model';
import { OrganizationOutboxModel } from '../model/organization-outbox.model';
import { OrganizationRecordModel } from '../model/organization-record.model';

const mapRecord = (row: OrganizationRecordModel): OrganizationRecord => ({
  id: row.id,
  companyId: row.companyId,
  type: row.type,
  code: row.code,
  name: row.name,
  status: row.status,
  parentId: row.parentId,
  effectiveFrom: row.effectiveFrom ? String(row.effectiveFrom).slice(0, 10) : null,
  effectiveTo: row.effectiveTo ? String(row.effectiveTo).slice(0, 10) : null,
  version: row.version,
  data: row.data,
});

const parentType: Partial<Record<OrganizationEntityType, OrganizationEntityType>> = {
  DEPARTMENT: 'DEPARTMENT',
  JOB_POSITION: 'JOB_FUNCTION',
  COST_CENTER: 'COST_CENTER',
  CALENDAR_EXCEPTION: 'WORK_CALENDAR',
  WORK_SHIFT: 'WORK_SCHEDULE',
};

const eventName = (type: OrganizationEntityType, action: string): string => {
  const names: Partial<Record<OrganizationEntityType, string>> = {
    DEPARTMENT: 'department',
    JOB_FUNCTION: 'job-function',
    JOB_POSITION: 'job-position',
    COST_CENTER: 'cost-center',
    COST_ALLOCATION: 'cost-allocation',
    ESTABLISHMENT: 'establishment',
    WORK_CALENDAR: 'calendar',
    WORK_SCHEDULE: 'schedule',
  };
  const actionName =
    action === 'active' ? 'activated' : action === 'inactive' ? 'deactivated' : action;
  return `organization.${names[type] ?? type.toLowerCase().replace(/_/g, '-')}.${actionName}`;
};

const withTenant = async <T>(
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

export class SequelizeOrganizationRepository implements OrganizationRepository {
  async create(
    companyId: number,
    actorUserId: number,
    input: OrganizationRecordInput,
  ): Promise<OrganizationRecord> {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      await this.validateReferences(companyId, input, transaction);
      if (input.type === 'COST_ALLOCATION') {
        throw new ValidationError('Create cost allocations using the batch allocation endpoint.');
      }
      if (input.type === 'WORK_SCHEDULE') {
        const shifts = (input.data?.shifts ?? []) as Array<{
          weekday: number;
          startTime: string;
          endTime: string;
          crossesMidnight?: boolean;
          breakMinutes?: number;
        }>;
        validateScheduleShifts(shifts);
      }
      if (input.type === 'WORK_SHIFT') {
        const schedule = input.parentId
          ? await OrganizationRecordModel.findOne({
              where: { id: input.parentId, companyId, type: 'WORK_SCHEDULE', status: 'ACTIVE' },
              transaction,
            })
          : null;
        if (!schedule) throw new NotFoundError('Active work schedule');
        const currentShifts = (schedule.data.shifts ?? []) as Array<{
          weekday: number;
          startTime: string;
          endTime: string;
          crossesMidnight?: boolean;
          breakMinutes?: number;
        }>;
        const newShift = input.data as {
          weekday: number;
          startTime: string;
          endTime: string;
          crossesMidnight?: boolean;
          breakMinutes?: number;
        };
        validateScheduleShifts([...currentShifts, newShift]);
        const previousSchedule = mapRecord(schedule);
        await schedule.update(
          {
            data: { ...schedule.data, shifts: [...currentShifts, newShift] },
            version: schedule.version + 1,
            updatedAt: new Date(),
          },
          { transaction },
        );
        await this.writeChange(
          transaction,
          companyId,
          actorUserId,
          mapRecord(schedule),
          'UPDATED',
          previousSchedule,
        );
      }
      if (input.effectiveFrom) validateDateRange(input.effectiveFrom, input.effectiveTo ?? null);
      if (['WORK_CALENDAR', 'SCHEDULE_ASSIGNMENT'].includes(input.type)) {
        await this.assertNoPeriodOverlap(companyId, input, transaction);
      }
      if (input.type === 'DEPARTMENT_ASSIGNMENT') {
        await this.assertNoDepartmentAssignmentOverlap(companyId, input, transaction);
      }
      const row = await this.insert(companyId, input, transaction);
      const record = mapRecord(row);
      await this.writeChange(transaction, companyId, actorUserId, record, 'CREATED', null);
      return record;
    });
  }

  async createCostAllocations(
    companyId: number,
    actorUserId: number,
    inputs: OrganizationRecordInput[],
  ): Promise<OrganizationRecord[]> {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      if (inputs.length === 0 || inputs.some((input) => input.type !== 'COST_ALLOCATION')) {
        throw new ValidationError('At least one valid cost allocation is required.');
      }
      const employees = new Set(inputs.map((input) => input.employeeId));
      const fromDates = new Set(inputs.map((input) => input.effectiveFrom));
      const toDates = new Set(inputs.map((input) => input.effectiveTo ?? null));
      if (employees.size !== 1 || fromDates.size !== 1 || toDates.size !== 1) {
        throw new ValidationError(
          'An allocation batch must share one employee and one effective period.',
        );
      }
      if (new Set(inputs.map((input) => input.relatedId)).size !== inputs.length) {
        throw new ValidationError('A cost center can only appear once in an allocation batch.');
      }
      const employeeId = inputs[0].employeeId;
      if (!employeeId) throw new ValidationError('Employee is required for a cost allocation.');
      const employee = await EmployeeModel.findOne({
        where: { id: employeeId, companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!employee) throw new NotFoundError('Employee');
      AllocationPercentage.assertTotal100(inputs.map((input) => input.percentage ?? 0));
      for (const input of inputs) {
        if (!input.relatedId)
          throw new ValidationError('Cost center is required for each allocation.');
        const costCenter = await OrganizationRecordModel.findOne({
          where: { id: input.relatedId, companyId, type: 'COST_CENTER', status: 'ACTIVE' },
          transaction,
        });
        if (!costCenter) throw new NotFoundError('Active cost center');
        if (!input.effectiveFrom)
          throw new ValidationError('Allocation effective date is required.');
        validateDateRange(input.effectiveFrom, input.effectiveTo ?? null);
        AllocationPercentage.create(input.percentage ?? 0);
      }
      const from = inputs[0].effectiveFrom!;
      const to = inputs[0].effectiveTo ?? null;
      const overlap = await OrganizationRecordModel.findOne({
        where: {
          companyId,
          type: 'COST_ALLOCATION',
          employeeId,
          [Op.and]: [
            { effectiveFrom: { [Op.lte]: to ?? '9999-12-31' } },
            { [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: from } }] },
          ],
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (overlap)
        throw new ConflictError('Cost allocations cannot overlap an existing effective period.');

      const created: OrganizationRecord[] = [];
      for (const input of inputs) {
        const row = await this.insert(companyId, input, transaction);
        const record = mapRecord(row);
        await this.writeChange(transaction, companyId, actorUserId, record, 'CREATED', null);
        created.push(record);
      }
      return created;
    });
  }

  async find(
    companyId: number,
    id: string,
    type?: OrganizationEntityType,
  ): Promise<OrganizationRecord | null> {
    return withTenant(companyId, async (transaction) => {
      const row = await OrganizationRecordModel.findOne({
        where: { id, companyId, ...(type ? { type } : {}) },
        transaction,
      });
      return row ? mapRecord(row) : null;
    });
  }

  async list(
    companyId: number,
    type: OrganizationEntityType,
    query: {
      page: number;
      limit: number;
      search?: string;
      status?: string;
      parentId?: string;
      relatedId?: string;
    },
  ) {
    return withTenant(companyId, async (transaction) => {
      const where: Record<string | symbol, unknown> = { companyId, type };
      if (query.status) where.status = query.status;
      if (query.parentId !== undefined) where.parentId = query.parentId;
      if (query.relatedId !== undefined) where.relatedId = query.relatedId;
      if (query.search) {
        where[Op.or] = [
          { code: { [Op.like]: `%${query.search}%` } },
          { name: { [Op.like]: `%${query.search}%` } },
        ];
      }
      const result = await OrganizationRecordModel.findAndCountAll({
        where,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        order: [['code', 'ASC']],
        transaction,
      });
      return {
        data: result.rows.map(mapRecord),
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
    actorUserId: number,
    id: string,
    expectedVersion: number,
    changes: Partial<OrganizationRecordInput>,
  ): Promise<OrganizationRecord> {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const row = await this.lockRecord(companyId, id, transaction);
      if (row.version !== expectedVersion)
        throw new ConflictError('Organization record was changed concurrently.');
      const before = mapRecord(row);
      const type = changes.type ?? before.type;
      if (
        ['WORK_CALENDAR', 'WORK_SCHEDULE', 'COST_ALLOCATION'].includes(row.type) &&
        row.effectiveFrom &&
        row.effectiveFrom < new Date().toISOString().slice(0, 10)
      ) {
        throw new ConflictError(
          'Effective organizational records cannot be changed retroactively.',
        );
      }
      const parentId = changes.parentId === undefined ? row.parentId : changes.parentId;
      const nextInput: OrganizationRecordInput = {
        type,
        code: changes.code ?? row.code,
        name: changes.name ?? row.name,
        parentId,
        effectiveFrom:
          changes.effectiveFrom === undefined ? row.effectiveFrom : changes.effectiveFrom,
        effectiveTo: changes.effectiveTo === undefined ? row.effectiveTo : changes.effectiveTo,
        employeeId: changes.employeeId === undefined ? row.employeeId : changes.employeeId,
        relatedId: changes.relatedId === undefined ? row.relatedId : changes.relatedId,
        percentage: changes.percentage === undefined ? row.percentage : changes.percentage,
        data: changes.data ?? row.data,
      };
      await this.validateReferences(companyId, nextInput, transaction, id);
      if (nextInput.effectiveFrom)
        validateDateRange(nextInput.effectiveFrom, nextInput.effectiveTo ?? null);
      if (type === 'COST_ALLOCATION') {
        AllocationPercentage.create(nextInput.percentage ?? 0);
        await this.validateUpdatedAllocation(companyId, row, nextInput, transaction);
      }
      if (['WORK_CALENDAR', 'SCHEDULE_ASSIGNMENT'].includes(type)) {
        await this.assertNoPeriodOverlap(companyId, nextInput, transaction, id);
      }
      const updatedData = {
        ...before,
        code: OrganizationCode.create(nextInput.code).value,
        name: nextInput.name.trim(),
        parentId,
        effectiveFrom: nextInput.effectiveFrom ?? null,
        effectiveTo: nextInput.effectiveTo ?? null,
        version: row.version + 1,
        data: nextInput.data ?? {},
      };
      try {
        await row.update(
          {
            code: updatedData.code,
            name: updatedData.name,
            parentId,
            effectiveFrom: updatedData.effectiveFrom,
            effectiveTo: updatedData.effectiveTo,
            employeeId: nextInput.employeeId ?? null,
            relatedId: nextInput.relatedId ?? null,
            percentage:
              nextInput.percentage == null ? null : Number(nextInput.percentage).toFixed(2),
            data: updatedData.data,
            version: updatedData.version,
            updatedAt: new Date(),
          },
          { transaction },
        );
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          throw new ConflictError('Code already exists for this organizational resource.');
        }
        throw error;
      }
      const result = mapRecord(row);
      await this.writeChange(transaction, companyId, actorUserId, result, 'UPDATED', before);
      return result;
    });
  }

  async setStatus(
    companyId: number,
    actorUserId: number,
    id: string,
    type: OrganizationEntityType,
    expectedVersion: number,
    status: 'ACTIVE' | 'INACTIVE',
  ): Promise<OrganizationRecord> {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const row = await this.lockRecord(companyId, id, transaction, type);
      if (row.version !== expectedVersion)
        throw new ConflictError('Organization record was changed concurrently.');
      if (type === 'COST_ALLOCATION' && status === 'INACTIVE') {
        throw new ConflictError(
          'Cost allocations must be ended by changing their effective period, not deactivated.',
        );
      }
      if (status === 'INACTIVE') await this.assertNoDependents(companyId, row, transaction);
      const before = mapRecord(row);
      await row.update(
        { status, version: row.version + 1, updatedAt: new Date() },
        { transaction },
      );
      const result = mapRecord(row);
      await this.writeChange(transaction, companyId, actorUserId, result, status, before);
      return result;
    });
  }

  async setParent(
    companyId: number,
    actorUserId: number,
    id: string,
    expectedVersion: number,
    parentId: string | null,
  ): Promise<OrganizationRecord> {
    return withTenant(companyId, async (transaction) => {
      await this.lockCompany(companyId, transaction);
      const row = await this.lockRecord(companyId, id, transaction, 'DEPARTMENT');
      if (row.version !== expectedVersion)
        throw new ConflictError('Department was changed concurrently.');
      const ancestors: string[] = [];
      let cursor = parentId;
      while (cursor) {
        if (cursor === id || ancestors.includes(cursor)) {
          throw new ConflictError('Department hierarchy cannot contain a cycle.');
        }
        ancestors.push(cursor);
        const parent = await OrganizationRecordModel.findOne({
          where: { id: cursor, companyId, type: 'DEPARTMENT' },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!parent) throw new NotFoundError('Parent department');
        cursor = parent.parentId;
      }
      const before = mapRecord(row);
      await row.update(
        { parentId, version: row.version + 1, updatedAt: new Date() },
        { transaction },
      );
      const result = mapRecord(row);
      await this.writeChange(transaction, companyId, actorUserId, result, 'MOVED', before);
      return result;
    });
  }

  async tree(companyId: number): Promise<OrganizationRecord[]> {
    return withTenant(companyId, async (transaction) => {
      const rows = await OrganizationRecordModel.findAll({
        where: { companyId, type: 'DEPARTMENT' },
        order: [['code', 'ASC']],
        transaction,
      });
      return rows.map(mapRecord);
    });
  }

  async history(companyId: number, id: string): Promise<Array<Record<string, unknown>>> {
    return withTenant(companyId, async (transaction) => {
      const rows = await OrganizationHistoryModel.findAll({
        where: { companyId, entityId: id },
        order: [
          ['createdAt', 'ASC'],
          ['id', 'ASC'],
        ],
        transaction,
      });
      return rows.map((row) => ({
        id: row.id,
        entityId: row.entityId,
        entityType: row.entityType,
        changeType: row.changeType,
        actorUserId: row.actorUserId,
        previousData: row.previousData,
        newData: row.newData,
        createdAt: row.createdAt,
      }));
    });
  }

  private async insert(
    companyId: number,
    input: OrganizationRecordInput,
    transaction: Transaction,
  ): Promise<OrganizationRecordModel> {
    const now = new Date();
    const code = OrganizationCode.create(input.code).value;
    const name = input.name.trim();
    if (!name || name.length > 150)
      throw new ValidationError('Name must contain 1 to 150 characters.');
    try {
      return await OrganizationRecordModel.create(
        {
          id: randomUUID(),
          companyId,
          type: input.type,
          code,
          name,
          status: 'ACTIVE',
          parentId: input.parentId ?? null,
          effectiveFrom: input.effectiveFrom ?? null,
          effectiveTo: input.effectiveTo ?? null,
          employeeId: input.employeeId ?? null,
          relatedId: input.relatedId ?? null,
          percentage: input.percentage == null ? null : Number(input.percentage).toFixed(2),
          version: 1,
          data: input.data ?? {},
          createdAt: now,
          updatedAt: now,
        },
        { transaction },
      );
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ConflictError('Code already exists for this organizational resource.');
      }
      throw error;
    }
  }

  private async validateReferences(
    companyId: number,
    input: OrganizationRecordInput,
    transaction: Transaction,
    entityId?: string,
  ): Promise<void> {
    if (input.parentId) {
      const expectedParent = parentType[input.type];
      if (!expectedParent)
        throw new ValidationError('This resource type does not support a parent.');
      const ancestors: string[] = [];
      let cursor: string | null = input.parentId;
      while (cursor) {
        if (cursor === entityId || ancestors.includes(cursor)) {
          throw new ConflictError('Organizational hierarchy cannot contain a cycle.');
        }
        ancestors.push(cursor);
        const parentRecord: OrganizationRecordModel | null = await OrganizationRecordModel.findOne({
          where: { id: cursor, companyId, type: expectedParent, status: 'ACTIVE' },
          transaction,
        });
        if (!parentRecord) throw new NotFoundError('Active parent organizational record');
        cursor = parentRecord.parentId;
      }
      validateHierarchy(entityId ?? null, input.parentId, []);
    }
    if (input.employeeId) {
      const employee = await EmployeeModel.findOne({
        where: { id: input.employeeId, companyId },
        attributes: ['id'],
        transaction,
      });
      if (!employee) throw new NotFoundError('Employee');
    }
    if (input.relatedId) {
      const expectedRelated: Partial<Record<OrganizationEntityType, OrganizationEntityType>> = {
        JOB_FUNCTION: 'PROFESSIONAL_CATEGORY',
        JOB_POSITION: 'JOB_FUNCTION',
        COST_ALLOCATION: 'COST_CENTER',
        SCHEDULE_ASSIGNMENT: 'WORK_SCHEDULE',
        DEPARTMENT_ASSIGNMENT: 'DEPARTMENT',
      };
      const expected = expectedRelated[input.type];
      if (!expected)
        throw new ValidationError('This resource type does not support a related record.');
      const related = await OrganizationRecordModel.findOne({
        where: { id: input.relatedId, companyId, type: expected, status: 'ACTIVE' },
        transaction,
      });
      if (!related) throw new NotFoundError(`Active ${expected.toLowerCase()}`);
    }
    if (input.type === 'DEPARTMENT' || input.type === 'COST_CENTER') {
      const establishmentId = input.data?.establishmentId;
      if (typeof establishmentId === 'string') {
        const establishment = await OrganizationRecordModel.findOne({
          where: { id: establishmentId, companyId, type: 'ESTABLISHMENT', status: 'ACTIVE' },
          transaction,
        });
        if (!establishment) throw new NotFoundError('Active establishment');
      }
    }
    if (input.type === 'DEPARTMENT') {
      const managerEmployeeId = input.data?.managerEmployeeId;
      if (typeof managerEmployeeId === 'string') {
        const manager = await EmployeeModel.findOne({
          where: { id: managerEmployeeId, companyId },
          attributes: ['id'],
          transaction,
        });
        if (!manager) throw new NotFoundError('Department manager');
      }
    }
    if (input.type === 'JOB_POSITION' && typeof input.data?.departmentId === 'string') {
      const department = await OrganizationRecordModel.findOne({
        where: { id: input.data.departmentId, companyId, type: 'DEPARTMENT', status: 'ACTIVE' },
        transaction,
      });
      if (!department) throw new NotFoundError('Active department');
    }
    if (input.type === 'SCHEDULE_ASSIGNMENT') {
      const targetType = input.data?.targetType;
      const targetId = input.data?.targetId;
      if (targetType === 'EMPLOYEE' && typeof targetId === 'string') {
        const employee = await EmployeeModel.findOne({
          where: { id: targetId, companyId },
          attributes: ['id'],
          transaction,
        });
        if (!employee) throw new NotFoundError('Employee schedule target');
      } else if (
        (targetType === 'DEPARTMENT' || targetType === 'ESTABLISHMENT') &&
        typeof targetId === 'string'
      ) {
        const target = await OrganizationRecordModel.findOne({
          where: {
            id: targetId,
            companyId,
            type: targetType,
            status: 'ACTIVE',
          },
          transaction,
        });
        if (!target) throw new NotFoundError('Schedule assignment target');
      }
    }
    if (input.type === 'WORK_CALENDAR' || input.type === 'WORK_SCHEDULE') {
      const establishmentId = input.data?.establishmentId;
      if (typeof establishmentId === 'string') {
        const establishment = await OrganizationRecordModel.findOne({
          where: { id: establishmentId, companyId, type: 'ESTABLISHMENT', status: 'ACTIVE' },
          transaction,
        });
        if (!establishment) throw new NotFoundError('Active establishment');
      }
      if (input.type === 'WORK_SCHEDULE' && typeof input.data?.departmentId === 'string') {
        const department = await OrganizationRecordModel.findOne({
          where: { id: input.data.departmentId, companyId, type: 'DEPARTMENT', status: 'ACTIVE' },
          transaction,
        });
        if (!department) throw new NotFoundError('Active department');
      }
    }
  }

  private async assertNoPeriodOverlap(
    companyId: number,
    input: OrganizationRecordInput,
    transaction: Transaction,
    excludeId?: string,
  ): Promise<void> {
    if (!input.effectiveFrom) return;
    const existing = await OrganizationRecordModel.findAll({
      where: {
        companyId,
        type: input.type,
        status: 'ACTIVE',
        ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const scopedFields = input.type === 'WORK_CALENDAR' ? ['establishmentId'] : ['targetId'];
    const scope = scopedFields.map((field) => input.data?.[field] ?? null);
    const targetType = input.type === 'SCHEDULE_ASSIGNMENT' ? input.data?.targetType : null;
    const from = input.effectiveFrom;
    const to = input.effectiveTo ?? null;
    const overlap = existing.some((record) => {
      if (scopedFields.some((field, index) => (record.data[field] ?? null) !== scope[index]))
        return false;
      if (input.type === 'SCHEDULE_ASSIGNMENT' && record.data.targetType !== targetType) {
        return false;
      }
      const existingFrom = record.effectiveFrom ? String(record.effectiveFrom).slice(0, 10) : null;
      const existingTo = record.effectiveTo ? String(record.effectiveTo).slice(0, 10) : null;
      if (!existingFrom) return false;
      return (to === null || existingFrom <= to) && (existingTo === null || existingTo >= from);
    });
    if (overlap)
      throw new ConflictError(
        'Effective periods cannot overlap for the same organizational scope.',
      );
  }

  private async assertNoDepartmentAssignmentOverlap(
    companyId: number,
    input: OrganizationRecordInput,
    transaction: Transaction,
  ): Promise<void> {
    if (!input.employeeId || !input.effectiveFrom) {
      throw new ValidationError(
        'Employee and effective date are required for department assignment.',
      );
    }
    validateDateRange(input.effectiveFrom, input.effectiveTo ?? null);
    if (input.data?.assignmentType !== 'PRIMARY') return;
    const records = await OrganizationRecordModel.findAll({
      where: {
        companyId,
        type: 'DEPARTMENT_ASSIGNMENT',
        employeeId: input.employeeId,
        status: 'ACTIVE',
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const from = input.effectiveFrom;
    const to = input.effectiveTo ?? null;
    const overlap = records.some((record) => {
      if (record.data.assignmentType !== 'PRIMARY' || !record.effectiveFrom) return false;
      const existingFrom = String(record.effectiveFrom).slice(0, 10);
      const existingTo = record.effectiveTo ? String(record.effectiveTo).slice(0, 10) : null;
      return (to === null || existingFrom <= to) && (existingTo === null || existingTo >= from);
    });
    if (overlap)
      throw new ConflictError(
        'An employee cannot have overlapping primary department assignments.',
      );
  }

  private async validateUpdatedAllocation(
    companyId: number,
    row: OrganizationRecordModel,
    input: OrganizationRecordInput,
    transaction: Transaction,
  ): Promise<void> {
    if (!input.employeeId || !input.effectiveFrom || !input.relatedId) {
      throw new ValidationError('Employee, cost center, and effective date are required.');
    }
    const employee = await EmployeeModel.findOne({
      where: { companyId, id: input.employeeId },
      transaction,
    });
    if (!employee) throw new NotFoundError('Employee');
    const peerRows = await OrganizationRecordModel.findAll({
      where: {
        companyId,
        type: 'COST_ALLOCATION',
        employeeId: input.employeeId,
        id: { [Op.ne]: row.id },
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    AllocationPercentage.assertTotal100([
      ...peerRows.map((peer) => peer.percentage ?? '0'),
      input.percentage ?? 0,
    ]);
  }

  private async assertNoDependents(
    companyId: number,
    row: OrganizationRecordModel,
    transaction: Transaction,
  ): Promise<void> {
    const dependents = await OrganizationRecordModel.findOne({
      where: { companyId, parentId: row.id, status: 'ACTIVE' },
      transaction,
    });
    if (dependents)
      throw new ConflictError('Resource has active child records that must be reassigned first.');
    if (row.type === 'DEPARTMENT') {
      const employee = await OrganizationRecordModel.findOne({
        where: {
          companyId,
          type: 'DEPARTMENT_ASSIGNMENT',
          relatedId: row.id,
          status: 'ACTIVE',
          [Op.or]: [
            { effectiveTo: null },
            { effectiveTo: { [Op.gte]: new Date().toISOString().slice(0, 10) } },
          ],
        },
        transaction,
      });
      if (employee)
        throw new ConflictError(
          'Active employees must be reassigned before deactivating the department.',
        );
    }
    if (row.type === 'COST_CENTER') {
      const allocation = await OrganizationRecordModel.findOne({
        where: {
          companyId,
          type: 'COST_ALLOCATION',
          relatedId: row.id,
          status: 'ACTIVE',
          [Op.or]: [
            { effectiveTo: null },
            { effectiveTo: { [Op.gte]: new Date().toISOString().slice(0, 10) } },
          ],
        },
        transaction,
      });
      if (allocation)
        throw new ConflictError('Active cost allocations must be reassigned before deactivation.');
    }
    if (row.type === 'WORK_SCHEDULE') {
      const assignment = await OrganizationRecordModel.findOne({
        where: { companyId, type: 'SCHEDULE_ASSIGNMENT', relatedId: row.id, status: 'ACTIVE' },
        transaction,
      });
      if (assignment)
        throw new ConflictError(
          'Schedule assignments must be ended before deactivating the schedule.',
        );
    }
    if (row.type === 'ESTABLISHMENT') {
      const department = await OrganizationRecordModel.findOne({
        where: { companyId, type: 'DEPARTMENT', status: 'ACTIVE' },
        transaction,
      });
      if (department && department.data.establishmentId === row.id) {
        throw new ConflictError(
          'Departments must be reassigned before deactivating the establishment.',
        );
      }
    }
  }

  private async lockRecord(
    companyId: number,
    id: string,
    transaction: Transaction,
    type?: OrganizationEntityType,
  ): Promise<OrganizationRecordModel> {
    const row = await OrganizationRecordModel.findOne({
      where: { id, companyId, ...(type ? { type } : {}) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!row) throw new NotFoundError('Organizational record');
    return row;
  }

  private async lockCompany(companyId: number, transaction: Transaction): Promise<void> {
    const company = await CompanyModel.findByPk(companyId, {
      attributes: ['id'],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!company) throw new NotFoundError('Company');
  }

  private async writeChange(
    transaction: Transaction,
    companyId: number,
    actorUserId: number,
    record: OrganizationRecord,
    changeType: string,
    previousData: OrganizationRecord | null,
  ): Promise<void> {
    const now = new Date();
    await OrganizationHistoryModel.create(
      {
        companyId,
        entityId: record.id,
        entityType: record.type,
        changeType,
        actorUserId,
        previousData: previousData as unknown as Record<string, unknown> | null,
        newData: record as unknown as Record<string, unknown>,
        createdAt: now,
      },
      { transaction },
    );
    await OrganizationOutboxModel.create(
      {
        companyId,
        aggregateId: record.id,
        eventType: eventName(record.type, changeType.toLowerCase()),
        payload: { version: 1, entity: record, previous: previousData },
        occurredAt: now,
        publishedAt: null,
      },
      { transaction },
    );
  }
}
