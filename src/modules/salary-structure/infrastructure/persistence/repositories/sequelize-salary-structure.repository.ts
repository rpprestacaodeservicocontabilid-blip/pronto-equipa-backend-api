import { randomUUID } from 'crypto';
import {
  Attributes,
  FindOptions,
  Model,
  ModelStatic,
  Op,
  QueryTypes,
  Transaction,
  UniqueConstraintError,
  WhereOptions,
} from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../../../shared/errors/app.error';
import { EmployeeModel } from '../../../../employees/infrastructure/persistence/model/employee.model';
import { EmploymentContractModel } from '../../../../contracts/infrastructure/persistence/model/employment-contract.model';
import {
  EmployeeSalaryAssignmentModel,
  EmployeeSalaryComponentModel,
  SalaryComponentModel,
  SalaryComponentVersionModel,
  SalaryGradeModel,
  SalaryOutboxModel,
  SalaryPolicyModel,
  SalaryRevisionBatchModel,
  SalaryRevisionItemModel,
  SalaryRevisionModel,
  SalarySnapshotModel,
  SalaryStepModel,
  SalaryStructureItemModel,
  SalaryStructureModel,
  SalaryStructureVersionModel,
  SalaryTableModel,
  SalaryTableVersionModel,
} from '../model/salary-structure.models';
import {
  SalaryCalculationComponent,
  SalaryComponentEvaluatorService,
  salaryCents,
  salaryMoney,
} from '../../../domain/services/salary-component-evaluator.service';

type VersionInput = {
  componentType: string;
  calculationMethod: string;
  frequency: string;
  currency: string;
  legalClassificationRef?: string;
  effectiveFrom: string;
  calculationConfig: Record<string, unknown>;
};
type StructureItemInput = {
  componentVersionId: string;
  amount?: string;
  percentage?: string;
  calculationConfig: Record<string, unknown>;
  required: boolean;
};
type AssignmentInput = {
  employeeId: string;
  contractId: string;
  structureVersionId: string;
  effectiveFrom: string;
  baseSalary: string;
  currency: string;
  components: Array<{
    componentVersionId: string;
    amount?: string;
    sourceReference?: string;
    calculationConfig: Record<string, unknown>;
  }>;
};
type RevisionInput = {
  employeeId: string;
  previousAssignmentId: string;
  effectiveFrom: string;
  reason: string;
  proposedData: Omit<AssignmentInput, 'employeeId' | 'contractId' | 'effectiveFrom'>;
};
type PolicyInput = { code: string; effectiveFrom: string; rules: Record<string, unknown> };
type BatchInput = {
  code: string;
  effectiveFrom: string;
  reason: string;
  idempotencyKey: string;
  items: Array<Omit<AssignmentInput, 'contractId' | 'effectiveFrom'> & { employeeId: string }>;
};
type SimulationInput = {
  baseSalary: string;
  currency: string;
  effectiveDate?: string;
  structureVersionId?: string;
  components: AssignmentInput['components'];
};

const now = (): Date => new Date();
const today = (): string => now().toISOString().slice(0, 10);
const validDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};
const monthlyCents = (amount: string, frequency: string): bigint => {
  const periodsPerYear: Record<string, bigint> = {
    MONTHLY: 12n,
    WEEKLY: 52n,
    BIWEEKLY: 26n,
    ANNUAL: 1n,
  };
  const periods = periodsPerYear[frequency];
  if (periods === undefined)
    throw new ValidationError('A recurring component needs a supported payment frequency.');
  return (salaryCents(amount) * periods + 6n) / 12n;
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

export class SequelizeSalaryStructureRepository {
  private readonly componentEvaluator = new SalaryComponentEvaluatorService();

  async listComponents(
    companyId: number,
    query: { page: number; limit: number; status?: string; code?: string },
  ) {
    return withTenant(companyId, async (transaction) => {
      const result = await SalaryComponentModel.findAndCountAll({
        where: {
          companyId,
          ...(query.status ? { status: query.status } : {}),
          ...(query.code ? { code: { [Op.like]: `%${query.code}%` } } : {}),
        },
        order: [['code', 'ASC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction,
      });
      return { data: result.rows, total: result.count, page: query.page, limit: query.limit };
    });
  }

  async getComponent(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const component = await this.requireComponent(companyId, id, transaction);
      const versions = await SalaryComponentVersionModel.findAll({
        where: { companyId, componentId: id },
        order: [['version', 'DESC']],
        transaction,
      });
      return { ...component.toJSON(), versions };
    });
  }

  async createComponent(
    companyId: number,
    actorUserId: number,
    input: VersionInput & {
      code: string;
      name: string;
      description?: string;
    },
  ) {
    this.validateVersion(input);
    return withTenant(companyId, async (transaction) => {
      const component = await SalaryComponentModel.create(
        {
          id: randomUUID(),
          companyId,
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          status: 'ACTIVE',
          version: 1,
          createdBy: actorUserId,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      const version = await this.createComponentVersionInTransaction(
        companyId,
        actorUserId,
        component,
        input,
        transaction,
      );
      await this.event(transaction, companyId, component.id, 'salary-structure.component.created', {
        eventVersion: 1,
        componentId: component.id,
        componentVersionId: version.id,
      });
      return { component, version };
    }).catch((error: unknown) =>
      this.mapUnique(error, 'Component code already exists in this company.'),
    );
  }

  async updateComponent(
    companyId: number,
    id: string,
    input: { name?: string; description?: string | null },
  ) {
    return withTenant(companyId, async (transaction) => {
      const component = await this.requireComponent(companyId, id, transaction, true);
      if (component.status !== 'ACTIVE')
        throw new ConflictError('Inactive components cannot be edited.');
      await component.update(
        { ...input, version: component.version + 1, updatedAt: now() },
        { transaction },
      );
      return component;
    });
  }

  async createComponentVersion(
    companyId: number,
    actorUserId: number,
    id: string,
    input: VersionInput,
  ) {
    this.validateVersion(input);
    return withTenant(companyId, async (transaction) => {
      const component = await this.requireComponent(companyId, id, transaction, true);
      if (component.status !== 'ACTIVE')
        throw new ConflictError('Inactive components cannot receive new versions.');
      const version = await this.createComponentVersionInTransaction(
        companyId,
        actorUserId,
        component,
        input,
        transaction,
      );
      return version;
    });
  }

  async publishComponentVersion(
    companyId: number,
    actorUserId: number,
    componentId: string,
    versionId: string,
  ) {
    return withTenant(companyId, async (transaction) => {
      const component = await this.requireComponent(companyId, componentId, transaction, true);
      const version = await SalaryComponentVersionModel.findOne({
        where: { id: versionId, componentId, companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!version) throw new NotFoundError('Salary component version');
      if (version.status === 'PUBLISHED') return version;
      if (version.status !== 'DRAFT')
        throw new ConflictError('Only draft component versions can be published.');
      if (component.status !== 'ACTIVE')
        throw new ConflictError('Inactive components cannot be published.');
      await this.ensureNoVersionOverlap(
        SalaryComponentVersionModel,
        companyId,
        'componentId',
        componentId,
        version.effectiveFrom,
        version.effectiveTo,
        version.id,
        transaction,
      );
      await version.update({ status: 'PUBLISHED' }, { transaction });
      await component.update(
        { version: Math.max(component.version, version.version), updatedAt: now() },
        { transaction },
      );
      await this.event(
        transaction,
        companyId,
        componentId,
        'salary-structure.component.version-published',
        {
          eventVersion: 1,
          componentVersionId: version.id,
          version: version.version,
          publishedBy: actorUserId,
        },
      );
      return version;
    });
  }

  async deactivateComponent(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const component = await this.requireComponent(companyId, id, transaction, true);
      if (component.status === 'INACTIVE') return component;
      await component.update(
        { status: 'INACTIVE', version: component.version + 1, updatedAt: now() },
        { transaction },
      );
      await this.event(
        transaction,
        companyId,
        component.id,
        'salary-structure.component.deactivated',
        { eventVersion: 1 },
      );
      return component;
    });
  }

  async listTables(companyId: number, query: { page: number; limit: number; status?: string }) {
    return withTenant(companyId, async (transaction) => {
      const result = await SalaryTableModel.findAndCountAll({
        where: { companyId, ...(query.status ? { status: query.status } : {}) },
        order: [['code', 'ASC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction,
      });
      return { data: result.rows, total: result.count, page: query.page, limit: query.limit };
    });
  }

  async createTable(
    companyId: number,
    actorUserId: number,
    input: { code: string; name: string; effectiveFrom: string },
  ) {
    if (!validDate(input.effectiveFrom))
      throw new ValidationError('A valid effective date is required.');
    return withTenant(companyId, async (transaction) => {
      const table = await SalaryTableModel.create(
        {
          id: randomUUID(),
          companyId,
          code: input.code,
          name: input.name,
          status: 'ACTIVE',
          version: 1,
          createdBy: actorUserId,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      const version = await SalaryTableVersionModel.create(
        {
          id: randomUUID(),
          companyId,
          tableId: table.id,
          version: 1,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: null,
          status: 'DRAFT',
          createdBy: actorUserId,
          createdAt: now(),
        },
        { transaction },
      );
      await this.event(transaction, companyId, table.id, 'salary-structure.table.created', {
        eventVersion: 1,
        versionId: version.id,
      });
      return { table, version };
    }).catch((error: unknown) =>
      this.mapUnique(error, 'Salary table code already exists in this company.'),
    );
  }

  async createTableVersion(
    companyId: number,
    actorUserId: number,
    tableId: string,
    effectiveFrom: string,
  ) {
    if (!validDate(effectiveFrom)) throw new ValidationError('A valid effective date is required.');
    return withTenant(companyId, async (transaction) => {
      const table = await this.requireTable(companyId, tableId, transaction, true);
      const latest = await SalaryTableVersionModel.findOne({
        where: { companyId, tableId },
        order: [['version', 'DESC']],
        transaction,
      });
      const version = await SalaryTableVersionModel.create(
        {
          id: randomUUID(),
          companyId,
          tableId,
          version: (latest?.version ?? 0) + 1,
          effectiveFrom,
          effectiveTo: null,
          status: 'DRAFT',
          createdBy: actorUserId,
          createdAt: now(),
        },
        { transaction },
      );
      await table.update({ version: version.version, updatedAt: now() }, { transaction });
      return version;
    });
  }

  async addGrade(
    companyId: number,
    tableId: string,
    input: {
      code: string;
      name: string;
      minAmount: string;
      maxAmount: string;
      currency: string;
      functionCode?: string;
      categoryCode?: string;
    },
  ) {
    const min = salaryCents(input.minAmount);
    const max = salaryCents(input.maxAmount);
    if (min > max) throw new ValidationError('Grade minimum cannot exceed its maximum.');
    return withTenant(companyId, async (transaction) => {
      await this.requireTable(companyId, tableId, transaction);
      const version = await SalaryTableVersionModel.findOne({
        where: { tableId, companyId, status: 'DRAFT' },
        order: [['version', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!version) throw new NotFoundError('Draft salary table version');
      if (version.status !== 'DRAFT')
        throw new ConflictError('Grades can only be added to a draft table version.');
      return SalaryGradeModel.create(
        {
          id: randomUUID(),
          companyId,
          tableVersionId: version.id,
          ...input,
          minAmount: salaryMoney(min),
          maxAmount: salaryMoney(max),
          createdAt: now(),
        },
        { transaction },
      ).catch((error: unknown) =>
        this.mapUnique(error, 'Grade code already exists in this table version.'),
      );
    });
  }

  async addStep(
    companyId: number,
    gradeId: string,
    input: { code: string; name: string; amount: string; currency: string },
  ) {
    const amount = salaryCents(input.amount);
    return withTenant(companyId, async (transaction) => {
      const grade = await SalaryGradeModel.findOne({
        where: { id: gradeId, companyId },
        transaction,
      });
      if (!grade) throw new NotFoundError('Salary grade');
      const version = await SalaryTableVersionModel.findOne({
        where: { id: grade.tableVersionId, companyId },
        transaction,
      });
      if (!version || version.status !== 'DRAFT')
        throw new ConflictError('Steps can only be added to a draft salary table.');
      if (
        input.currency !== grade.currency ||
        amount < salaryCents(String(grade.minAmount)) ||
        amount > salaryCents(String(grade.maxAmount))
      ) {
        throw new ValidationError('Step amount and currency must be within the grade band.');
      }
      return SalaryStepModel.create(
        {
          id: randomUUID(),
          companyId,
          gradeId,
          ...input,
          amount: salaryMoney(amount),
          createdAt: now(),
        },
        { transaction },
      ).catch((error: unknown) => this.mapUnique(error, 'Step code already exists in this grade.'));
    });
  }

  async publishTableVersion(
    companyId: number,
    actorUserId: number,
    tableId: string,
    versionId: string,
  ) {
    return withTenant(companyId, async (transaction) => {
      await this.requireTable(companyId, tableId, transaction, true);
      const version = await SalaryTableVersionModel.findOne({
        where: { id: versionId, tableId, companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!version) throw new NotFoundError('Salary table version');
      if (version.status === 'PUBLISHED') return version;
      if (version.status !== 'DRAFT')
        throw new ConflictError('Only draft table versions can be published.');
      await this.ensureNoVersionOverlap(
        SalaryTableVersionModel,
        companyId,
        'tableId',
        tableId,
        version.effectiveFrom,
        version.effectiveTo,
        version.id,
        transaction,
      );
      const grades = await SalaryGradeModel.findAll({
        where: { companyId, tableVersionId: version.id },
        transaction,
      });
      if (!grades.length)
        throw new ConflictError(
          'A salary table version needs at least one grade before publication.',
        );
      await version.update({ status: 'PUBLISHED' }, { transaction });
      await this.event(
        transaction,
        companyId,
        tableId,
        'salary-structure.table.version-published',
        {
          eventVersion: 1,
          tableVersionId: version.id,
          publishedBy: actorUserId,
        },
      );
      return version;
    });
  }

  async getTable(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const table = await this.requireTable(companyId, id, transaction);
      const versions = await SalaryTableVersionModel.findAll({
        where: { companyId, tableId: id },
        order: [['version', 'DESC']],
        transaction,
      });
      const versionIds = versions.map((item) => item.id);
      const grades = await SalaryGradeModel.findAll({
        where: { companyId, tableVersionId: { [Op.in]: versionIds } },
        order: [['code', 'ASC']],
        transaction,
      });
      const gradeIds = grades.map((grade) => grade.id);
      const steps = gradeIds.length
        ? await SalaryStepModel.findAll({
            where: { companyId, gradeId: { [Op.in]: gradeIds } },
            order: [['code', 'ASC']],
            transaction,
          })
        : [];
      return { ...table.toJSON(), versions, grades, steps };
    });
  }

  async listStructures(companyId: number, query: { page: number; limit: number; status?: string }) {
    return withTenant(companyId, async (transaction) => {
      const result = await SalaryStructureModel.findAndCountAll({
        where: { companyId, ...(query.status ? { status: query.status } : {}) },
        order: [['code', 'ASC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction,
      });
      return { data: result.rows, total: result.count, page: query.page, limit: query.limit };
    });
  }

  async createStructure(
    companyId: number,
    actorUserId: number,
    input: {
      code: string;
      name: string;
      effectiveFrom: string;
      items: StructureItemInput[];
    },
  ) {
    if (!validDate(input.effectiveFrom))
      throw new ValidationError('A valid effective date is required.');
    this.validateItems(input.items);
    return withTenant(companyId, async (transaction) => {
      await this.validateStructureItems(companyId, input.items, input.effectiveFrom, transaction);
      const structure = await SalaryStructureModel.create(
        {
          id: randomUUID(),
          companyId,
          code: input.code,
          name: input.name,
          status: 'ACTIVE',
          version: 1,
          createdBy: actorUserId,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      const version = await SalaryStructureVersionModel.create(
        {
          id: randomUUID(),
          companyId,
          structureId: structure.id,
          version: 1,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: null,
          status: 'DRAFT',
          approvedBy: null,
          approvedAt: null,
          publishedAt: null,
          createdBy: actorUserId,
          createdAt: now(),
        },
        { transaction },
      );
      await this.createStructureItems(companyId, version.id, input.items, transaction);
      await this.event(transaction, companyId, structure.id, 'salary-structure.structure.created', {
        eventVersion: 1,
        structureVersionId: version.id,
      });
      return { structure, version };
    }).catch((error: unknown) =>
      this.mapUnique(error, 'Salary structure code already exists in this company.'),
    );
  }

  async getStructure(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const structure = await this.requireStructure(companyId, id, transaction);
      const versions = await SalaryStructureVersionModel.findAll({
        where: { companyId, structureId: id },
        order: [['version', 'DESC']],
        transaction,
      });
      const versionIds = versions.map((version) => version.id);
      const items = versionIds.length
        ? await SalaryStructureItemModel.findAll({
            where: { companyId, structureVersionId: { [Op.in]: versionIds } },
            transaction,
          })
        : [];
      return { ...structure.toJSON(), versions, items };
    });
  }

  async createStructureVersion(
    companyId: number,
    actorUserId: number,
    structureId: string,
    input: {
      effectiveFrom: string;
      items: StructureItemInput[];
    },
  ) {
    if (!validDate(input.effectiveFrom))
      throw new ValidationError('A valid effective date is required.');
    this.validateItems(input.items);
    return withTenant(companyId, async (transaction) => {
      const structure = await this.requireStructure(companyId, structureId, transaction, true);
      if (structure.status !== 'ACTIVE')
        throw new ConflictError('Archived structures cannot receive new versions.');
      await this.validateStructureItems(companyId, input.items, input.effectiveFrom, transaction);
      const latest = await SalaryStructureVersionModel.findOne({
        where: { companyId, structureId },
        order: [['version', 'DESC']],
        transaction,
      });
      if (latest && ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(latest.status)) {
        throw new ConflictError(
          'Resolve the current salary structure version before creating another version.',
        );
      }
      const version = await SalaryStructureVersionModel.create(
        {
          id: randomUUID(),
          companyId,
          structureId,
          version: (latest?.version ?? 0) + 1,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: null,
          status: 'DRAFT',
          approvedBy: null,
          approvedAt: null,
          publishedAt: null,
          createdBy: actorUserId,
          createdAt: now(),
        },
        { transaction },
      );
      await this.createStructureItems(companyId, version.id, input.items, transaction);
      await structure.update({ version: version.version, updatedAt: now() }, { transaction });
      return version;
    });
  }

  async submitStructure(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const version = await this.latestStructureVersion(companyId, id, transaction, true);
      if (version.status !== 'DRAFT')
        throw new ConflictError('Only draft salary structures can be submitted.');
      const items = await SalaryStructureItemModel.count({
        where: { companyId, structureVersionId: version.id },
        transaction,
      });
      if (!items) throw new ConflictError('A salary structure needs at least one component.');
      await version.update({ status: 'PENDING_APPROVAL' }, { transaction });
      return version;
    });
  }

  async decideStructure(
    companyId: number,
    actorUserId: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
  ) {
    return withTenant(companyId, async (transaction) => {
      const version = await this.latestStructureVersion(companyId, id, transaction, true);
      if (version.status !== 'PENDING_APPROVAL')
        throw new ConflictError('Only pending salary structures can be decided.');
      if (version.createdBy === actorUserId)
        throw new ForbiddenError('The proposer cannot approve their own salary structure.');
      await version.update(
        {
          status: decision,
          approvedBy: decision === 'APPROVED' ? actorUserId : null,
          approvedAt: decision === 'APPROVED' ? now() : null,
        },
        { transaction },
      );
      if (decision === 'APPROVED') {
        await this.event(transaction, companyId, id, 'salary-structure.structure.approved', {
          eventVersion: 1,
          versionId: version.id,
        });
      }
      return version;
    });
  }

  async publishStructure(companyId: number, actorUserId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      await this.requireStructure(companyId, id, transaction, true);
      const version = await this.latestStructureVersion(companyId, id, transaction, true);
      if (version.status === 'PUBLISHED' || version.status === 'SCHEDULED') return version;
      if (version.status !== 'APPROVED')
        throw new ConflictError('Only approved salary structure versions can be published.');
      await this.ensureNoVersionOverlap(
        SalaryStructureVersionModel,
        companyId,
        'structureId',
        id,
        version.effectiveFrom,
        version.effectiveTo,
        version.id,
        transaction,
        ['PUBLISHED'],
      );
      await version.update(
        { status: version.effectiveFrom > today() ? 'SCHEDULED' : 'PUBLISHED', publishedAt: now() },
        { transaction },
      );
      await this.event(transaction, companyId, id, 'salary-structure.structure.published', {
        eventVersion: 1,
        versionId: version.id,
        publishedBy: actorUserId,
      });
      return version;
    });
  }

  async createAssignment(companyId: number, actorUserId: number, input: AssignmentInput) {
    return withTenant(companyId, (transaction) =>
      this.createAssignmentInTransaction(companyId, actorUserId, input, transaction),
    );
  }

  async listAssignments(
    companyId: number,
    query: { page: number; limit: number; employeeId?: string; status?: string },
  ) {
    return withTenant(companyId, async (transaction) => {
      const result = await EmployeeSalaryAssignmentModel.findAndCountAll({
        where: {
          companyId,
          ...(query.employeeId ? { employeeId: query.employeeId } : {}),
          ...(query.status ? { status: query.status } : {}),
        },
        order: [['effectiveFrom', 'DESC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction,
      });
      return { data: result.rows, total: result.count, page: query.page, limit: query.limit };
    });
  }

  async getAssignment(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const assignment = await this.requireAssignment(companyId, id, transaction);
      const components = await EmployeeSalaryComponentModel.findAll({
        where: { companyId, assignmentId: id },
        transaction,
      });
      return { ...assignment.toJSON(), components };
    });
  }

  async currentSalary(companyId: number, employeeId: string, effectiveDate = today()) {
    return this.currentSalaryReport(companyId, employeeId, effectiveDate);
  }

  async assignmentHistory(companyId: number, employeeId: string) {
    return withTenant(companyId, async (transaction) => {
      await this.requireEmployee(companyId, employeeId, transaction);
      const assignments = await EmployeeSalaryAssignmentModel.findAll({
        where: { companyId, employeeId },
        order: [['effectiveFrom', 'DESC']],
        transaction,
      });
      const components = assignments.length
        ? await EmployeeSalaryComponentModel.findAll({
            where: { companyId, assignmentId: { [Op.in]: assignments.map((item) => item.id) } },
            transaction,
          })
        : [];
      return { assignments, components };
    });
  }

  async resolveSnapshot(companyId: number, employeeId: string, effectiveDate: string) {
    if (!validDate(effectiveDate)) throw new ValidationError('A valid effective date is required.');
    return withTenant(companyId, async (transaction) => {
      await this.requireEmployee(companyId, employeeId, transaction);
      const assignment = await EmployeeSalaryAssignmentModel.findOne({
        where: {
          companyId,
          employeeId,
          status: 'ACTIVE',
          effectiveFrom: { [Op.lte]: effectiveDate },
          [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: effectiveDate } }],
        },
        order: [['effectiveFrom', 'DESC']],
        transaction,
      });
      if (!assignment) throw new NotFoundError('Effective salary assignment');
      const existing = await SalarySnapshotModel.findOne({
        where: { companyId, employeeId, effectiveDate, assignmentId: assignment.id },
        transaction,
      });
      if (existing) return existing;

      const { resolved, versionIds } = await this.resolveAssignedComponents(
        companyId,
        assignment,
        transaction,
      );
      const snapshot = await SalarySnapshotModel.create(
        {
          id: randomUUID(),
          companyId,
          employeeId,
          effectiveDate,
          assignmentId: assignment.id,
          sourceVersions: {
            assignmentVersion: assignment.version,
            structureVersionId: assignment.structureVersionId,
            componentVersionIds: versionIds,
          },
          resolvedComponents: resolved,
          createdAt: now(),
        },
        { transaction },
      );
      await this.event(transaction, companyId, employeeId, 'salary-structure.snapshot.resolved', {
        eventVersion: 1,
        snapshotId: snapshot.id,
        effectiveDate,
        assignmentId: assignment.id,
      });
      return snapshot;
    }).catch((error: unknown) =>
      this.mapUnique(error, 'A salary snapshot for this date is already being resolved.'),
    );
  }

  async createRevision(companyId: number, actorUserId: number, input: RevisionInput) {
    if (!validDate(input.effectiveFrom) || !input.reason.trim())
      throw new ValidationError('A valid effective date and revision reason are required.');
    return withTenant(companyId, async (transaction) => {
      await this.requireEmployee(companyId, input.employeeId, transaction);
      const previous = await this.requireAssignment(
        companyId,
        input.previousAssignmentId,
        transaction,
      );
      if (previous.employeeId !== input.employeeId)
        throw new ValidationError('The previous assignment must belong to the employee.');
      const draft = await SalaryRevisionModel.create(
        {
          id: randomUUID(),
          companyId,
          employeeId: input.employeeId,
          previousAssignmentId: previous.id,
          proposedData: input.proposedData,
          effectiveFrom: input.effectiveFrom,
          status: 'DRAFT',
          reason: input.reason,
          requestedBy: actorUserId,
          decidedBy: null,
          decidedAt: null,
          appliedAssignmentId: null,
          idempotencyKey: null,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      await this.event(transaction, companyId, draft.id, 'salary-structure.revision.created', {
        eventVersion: 1,
        employeeId: input.employeeId,
        effectiveFrom: input.effectiveFrom,
      });
      return draft;
    });
  }

  async listRevisions(
    companyId: number,
    query: { page: number; limit: number; status?: string; employeeId?: string },
  ) {
    return withTenant(companyId, async (transaction) => {
      const result = await SalaryRevisionModel.findAndCountAll({
        where: {
          companyId,
          ...(query.status ? { status: query.status } : {}),
          ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        },
        order: [['createdAt', 'DESC']],
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        transaction,
      });
      return { data: result.rows, total: result.count, page: query.page, limit: query.limit };
    });
  }

  async getRevision(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const revision = await this.requireRevision(companyId, id, transaction);
      const previousAssignment = await this.requireAssignment(
        companyId,
        revision.previousAssignmentId,
        transaction,
      );
      const retroactiveSnapshots = await SalarySnapshotModel.count({
        where: {
          companyId,
          employeeId: revision.employeeId,
          effectiveDate: { [Op.gte]: revision.effectiveFrom },
        },
        transaction,
      });
      return {
        ...revision.toJSON(),
        previousAssignment,
        impact: { snapshotsToReview: retroactiveSnapshots },
      };
    });
  }

  async submitRevision(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const revision = await this.requireRevision(companyId, id, transaction, true);
      if (revision.status !== 'DRAFT')
        throw new ConflictError('Only draft salary revisions can be submitted.');
      const previous = await this.requireAssignment(
        companyId,
        revision.previousAssignmentId,
        transaction,
      );
      const data = revision.proposedData as unknown as Omit<
        AssignmentInput,
        'employeeId' | 'contractId' | 'effectiveFrom'
      >;
      await this.validateAssignment(
        companyId,
        {
          ...data,
          employeeId: revision.employeeId,
          contractId: previous.contractId,
          effectiveFrom: revision.effectiveFrom,
        },
        transaction,
      );
      await revision.update({ status: 'PENDING_APPROVAL', updatedAt: now() }, { transaction });
      return revision;
    });
  }

  async decideRevision(
    companyId: number,
    actorUserId: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    return withTenant(companyId, async (transaction) => {
      const revision = await this.requireRevision(companyId, id, transaction, true);
      if (revision.status !== 'PENDING_APPROVAL')
        throw new ConflictError('Only pending salary revisions can be decided.');
      if (revision.requestedBy === actorUserId)
        throw new ForbiddenError('Revision requesters cannot approve their own salary changes.');
      await revision.update(
        {
          status: decision,
          decidedBy: actorUserId,
          decidedAt: now(),
          proposedData: reason
            ? { ...revision.proposedData, decisionReason: reason }
            : revision.proposedData,
          updatedAt: now(),
        },
        { transaction },
      );
      if (decision === 'APPROVED') {
        await this.event(
          transaction,
          companyId,
          revision.id,
          'salary-structure.revision.approved',
          { eventVersion: 1 },
        );
      }
      return revision;
    });
  }

  async applyRevision(companyId: number, actorUserId: number, id: string, idempotencyKey: string) {
    return withTenant(companyId, async (transaction) => {
      const revision = await this.requireRevision(companyId, id, transaction, true);
      if (revision.status === 'APPLIED' && revision.appliedAssignmentId) {
        if (revision.idempotencyKey !== idempotencyKey)
          throw new ConflictError('Revision was already applied with another idempotency key.');
        return this.requireAssignment(companyId, revision.appliedAssignmentId, transaction);
      }
      if (revision.status !== 'APPROVED')
        throw new ConflictError('Only approved salary revisions can be applied.');
      const previous = await this.requireAssignment(
        companyId,
        revision.previousAssignmentId,
        transaction,
        true,
      );
      const proposed = revision.proposedData as unknown as Omit<
        AssignmentInput,
        'employeeId' | 'contractId' | 'effectiveFrom'
      >;
      const assignment = await this.createAssignmentInTransaction(
        companyId,
        actorUserId,
        {
          ...proposed,
          employeeId: revision.employeeId,
          contractId: previous.contractId,
          effectiveFrom: revision.effectiveFrom,
        },
        transaction,
        revision.id,
      );
      await revision.update(
        {
          status: 'APPLIED',
          appliedAssignmentId: assignment.id,
          idempotencyKey,
          updatedAt: now(),
        },
        { transaction },
      );
      await this.event(transaction, companyId, revision.id, 'salary-structure.revision.applied', {
        eventVersion: 1,
        assignmentId: assignment.id,
        effectiveFrom: revision.effectiveFrom,
      });
      return assignment;
    }).catch((error: unknown) =>
      this.mapUnique(error, 'Revision idempotency key has already been used.'),
    );
  }

  async createRevisionBatch(companyId: number, actorUserId: number, input: BatchInput) {
    if (!validDate(input.effectiveFrom))
      throw new ValidationError('A valid batch effective date is required.');
    if (new Set(input.items.map((item) => item.employeeId)).size !== input.items.length) {
      throw new ValidationError('A revision batch can only include each employee once.');
    }
    return withTenant(companyId, async (transaction) => {
      const existing = await SalaryRevisionBatchModel.findOne({
        where: { companyId, idempotencyKey: input.idempotencyKey },
        transaction,
      });
      if (existing) {
        const existingItems = await SalaryRevisionItemModel.findAll({
          where: { companyId, batchId: existing.id },
          order: [['employeeId', 'ASC']],
          transaction,
        });
        const submitted = [...input.items].sort((a, b) => a.employeeId.localeCompare(b.employeeId));
        if (
          existing.code !== input.code ||
          existing.reason !== input.reason ||
          existing.effectiveFrom !== input.effectiveFrom ||
          existingItems.length !== submitted.length ||
          existingItems.some(
            (item, index) =>
              item.employeeId !== submitted[index].employeeId ||
              JSON.stringify(item.proposedData) !==
                JSON.stringify({
                  baseSalary: submitted[index].baseSalary,
                  currency: submitted[index].currency,
                  structureVersionId: submitted[index].structureVersionId,
                  components: submitted[index].components,
                }),
          )
        ) {
          throw new ConflictError(
            'Batch idempotency key was already used for a different request.',
          );
        }
        return this.getRevisionBatchInTransaction(companyId, existing.id, transaction);
      }
      const batch = await SalaryRevisionBatchModel.create(
        {
          id: randomUUID(),
          companyId,
          code: input.code,
          status: 'DRAFT',
          effectiveFrom: input.effectiveFrom,
          reason: input.reason,
          requestedBy: actorUserId,
          idempotencyKey: input.idempotencyKey,
          approvedBy: null,
          approvedAt: null,
          createdAt: now(),
          updatedAt: now(),
        },
        { transaction },
      );
      for (const item of input.items) {
        const previous = await EmployeeSalaryAssignmentModel.findOne({
          where: {
            companyId,
            employeeId: item.employeeId,
            status: 'ACTIVE',
            effectiveFrom: { [Op.lte]: input.effectiveFrom },
            [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: input.effectiveFrom } }],
          },
          order: [['effectiveFrom', 'DESC']],
          transaction,
        });
        await SalaryRevisionItemModel.create(
          {
            id: randomUUID(),
            companyId,
            batchId: batch.id,
            employeeId: item.employeeId,
            previousAssignmentId: previous?.id ?? null,
            proposedData: {
              baseSalary: item.baseSalary,
              currency: item.currency,
              structureVersionId: item.structureVersionId,
              components: item.components,
            },
            status: previous ? 'PENDING' : 'INVALID',
            error: previous ? null : 'Employee has no effective salary assignment for this date.',
            assignmentId: null,
            createdAt: now(),
          },
          { transaction },
        );
      }
      await this.event(
        transaction,
        companyId,
        batch.id,
        'salary-structure.revision-batch.created',
        {
          eventVersion: 1,
          itemCount: input.items.length,
        },
      );
      return this.getRevisionBatchInTransaction(companyId, batch.id, transaction);
    }).catch((error: unknown) =>
      this.mapUnique(error, 'Revision batch code or idempotency key already exists.'),
    );
  }

  async getRevisionBatch(companyId: number, id: string) {
    return withTenant(companyId, (transaction) =>
      this.getRevisionBatchInTransaction(companyId, id, transaction),
    );
  }

  async validateRevisionBatch(companyId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const batch = await this.requireBatch(companyId, id, transaction, true);
      if (batch.status !== 'DRAFT' && batch.status !== 'VALIDATED')
        throw new ConflictError('Only draft batches can be validated.');
      const items = await SalaryRevisionItemModel.findAll({
        where: { companyId, batchId: id, status: 'PENDING' },
        transaction,
      });
      for (const item of items) {
        try {
          const previous = item.previousAssignmentId
            ? await this.requireAssignment(companyId, item.previousAssignmentId, transaction)
            : null;
          if (!previous) throw new ValidationError('Previous salary assignment is unavailable.');
          const proposed = item.proposedData as unknown as Omit<
            AssignmentInput,
            'employeeId' | 'contractId' | 'effectiveFrom'
          >;
          await this.validateAssignment(
            companyId,
            {
              ...proposed,
              employeeId: item.employeeId,
              contractId: previous.contractId,
              effectiveFrom: batch.effectiveFrom,
            },
            transaction,
          );
          await item.update({ status: 'VALIDATED' }, { transaction });
        } catch (error) {
          await item.update(
            {
              status: 'INVALID',
              error:
                error instanceof Error ? error.message : 'Salary assignment validation failed.',
            },
            { transaction },
          );
        }
      }
      await batch.update({ status: 'VALIDATED', updatedAt: now() }, { transaction });
      return this.getRevisionBatchInTransaction(companyId, id, transaction);
    });
  }

  async approveRevisionBatch(companyId: number, actorUserId: number, id: string) {
    return withTenant(companyId, async (transaction) => {
      const batch = await this.requireBatch(companyId, id, transaction, true);
      if (batch.status !== 'VALIDATED')
        throw new ConflictError('Only validated salary batches can be approved.');
      if (batch.requestedBy === actorUserId)
        throw new ForbiddenError('Batch requesters cannot approve their own salary changes.');
      const invalid = await SalaryRevisionItemModel.count({
        where: { companyId, batchId: id, status: 'INVALID' },
        transaction,
      });
      if (invalid > 0) throw new ConflictError('All batch items must be valid before approval.');
      await batch.update(
        { status: 'APPROVED', approvedBy: actorUserId, approvedAt: now(), updatedAt: now() },
        { transaction },
      );
      await this.event(
        transaction,
        companyId,
        batch.id,
        'salary-structure.revision-batch.approved',
        {
          eventVersion: 1,
          approvedBy: actorUserId,
        },
      );
      return this.getRevisionBatchInTransaction(companyId, id, transaction);
    });
  }

  async applyRevisionBatch(companyId: number, actorUserId: number, id: string) {
    const initial = await this.getRevisionBatch(companyId, id);
    if (initial.status === 'COMPLETED' || initial.status === 'FAILED') return initial;
    if (initial.status !== 'APPROVED' && initial.status !== 'APPLYING') {
      throw new ConflictError('A revision batch must be approved before it is applied.');
    }
    if (initial.status === 'APPROVED') {
      await withTenant(companyId, async (transaction) => {
        const batch = await this.requireBatch(companyId, id, transaction, true);
        if (batch.status === 'APPROVED')
          await batch.update({ status: 'APPLYING', updatedAt: now() }, { transaction });
      });
    }
    const pending = initial.items.filter((item: { status: string }) => item.status === 'VALIDATED');
    for (const item of pending) {
      try {
        await withTenant(companyId, async (transaction) => {
          const batch = await this.requireBatch(companyId, id, transaction);
          const locked = await SalaryRevisionItemModel.findOne({
            where: { id: item.id, companyId, batchId: id },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (!locked || locked.status !== 'VALIDATED') return;
          const previous = await this.requireAssignment(
            companyId,
            locked.previousAssignmentId as string,
            transaction,
            true,
          );
          const proposed = locked.proposedData as unknown as Omit<
            AssignmentInput,
            'employeeId' | 'contractId' | 'effectiveFrom'
          >;
          const assignment = await this.createAssignmentInTransaction(
            companyId,
            actorUserId,
            {
              ...proposed,
              employeeId: locked.employeeId,
              contractId: previous.contractId,
              effectiveFrom: batch.effectiveFrom,
            },
            transaction,
          );
          await locked.update(
            { status: 'APPLIED', assignmentId: assignment.id, error: null },
            { transaction },
          );
        });
      } catch (error) {
        await withTenant(companyId, async (transaction) => {
          const locked = await SalaryRevisionItemModel.findOne({
            where: { id: item.id, companyId, batchId: id },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (locked && locked.status === 'VALIDATED') {
            await locked.update(
              {
                status: 'FAILED',
                error: error instanceof Error ? error.message : 'Assignment failed.',
              },
              { transaction },
            );
          }
        });
      }
    }
    return withTenant(companyId, async (transaction) => {
      const batch = await this.requireBatch(companyId, id, transaction, true);
      const items = await SalaryRevisionItemModel.findAll({
        where: { companyId, batchId: id },
        transaction,
      });
      const failures = items.filter((item) => ['FAILED', 'INVALID'].includes(item.status)).length;
      const remaining = items.some((item) => ['VALIDATED', 'PENDING'].includes(item.status));
      const status = remaining ? 'APPLYING' : failures ? 'FAILED' : 'COMPLETED';
      await batch.update({ status, updatedAt: now() }, { transaction });
      if (!remaining) {
        await this.event(
          transaction,
          companyId,
          batch.id,
          `salary-structure.revision-batch.${status === 'COMPLETED' ? 'completed' : 'failed'}`,
          {
            eventVersion: 1,
            applied: items.filter((item) => item.status === 'APPLIED').length,
            failed: failures,
          },
        );
      }
      return this.getRevisionBatchInTransaction(companyId, id, transaction);
    });
  }

  async createPolicy(companyId: number, actorUserId: number, input: PolicyInput) {
    if (!validDate(input.effectiveFrom))
      throw new ValidationError('A valid policy effective date is required.');
    return withTenant(companyId, async (transaction) => {
      const latest = await SalaryPolicyModel.findOne({
        where: { companyId, code: input.code },
        order: [['version', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (latest && latest.effectiveFrom >= input.effectiveFrom) {
        throw new ConflictError('A salary policy version must start after the previous version.');
      }
      if (latest?.active) {
        const previousDate = new Date(`${input.effectiveFrom}T00:00:00.000Z`);
        previousDate.setUTCDate(previousDate.getUTCDate() - 1);
        await latest.update(
          {
            active: false,
            effectiveTo: previousDate.toISOString().slice(0, 10),
          },
          { transaction },
        );
      }
      const policy = await SalaryPolicyModel.create(
        {
          id: randomUUID(),
          companyId,
          code: input.code,
          version: (latest?.version ?? 0) + 1,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: null,
          rules: input.rules,
          active: true,
          createdBy: actorUserId,
          createdAt: now(),
        },
        { transaction },
      );
      await this.event(transaction, companyId, policy.id, 'salary-structure.policy.created', {
        eventVersion: 1,
        code: policy.code,
        version: policy.version,
      });
      return policy;
    });
  }

  async listPolicies(companyId: number) {
    return withTenant(companyId, (transaction) =>
      SalaryPolicyModel.findAll({
        where: { companyId },
        order: [
          ['code', 'ASC'],
          ['version', 'DESC'],
        ],
        transaction,
      }),
    );
  }

  async simulate(companyId: number, input: SimulationInput) {
    const effectiveDate = input.effectiveDate ?? today();
    if (!validDate(effectiveDate))
      throw new ValidationError('A valid simulation effective date is required.');
    const baseCents = salaryCents(input.baseSalary);
    if (baseCents <= 0n) throw new ValidationError('Base salary must be greater than zero.');
    return withTenant(companyId, async (transaction) => {
      let structureItems: SalaryStructureItemModel[] = [];
      if (input.structureVersionId) {
        const structureVersion = await SalaryStructureVersionModel.findOne({
          where: {
            id: input.structureVersionId,
            companyId,
            status: { [Op.in]: ['PUBLISHED', 'SCHEDULED', 'SUPERSEDED'] },
            effectiveFrom: { [Op.lte]: effectiveDate },
            [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: effectiveDate } }],
          },
          transaction,
        });
        if (!structureVersion)
          throw new ValidationError(
            'A published structure version must be effective on the simulation date.',
          );
        structureItems = await SalaryStructureItemModel.findAll({
          where: { companyId, structureVersionId: structureVersion.id },
          transaction,
        });
      }

      const itemByVersion = new Map(structureItems.map((item) => [item.componentVersionId, item]));
      const overrides = new Map(
        input.components.map((component) => [component.componentVersionId, component]),
      );
      if (overrides.size !== input.components.length)
        throw new ValidationError('A salary component can only be simulated once.');
      if (input.structureVersionId && [...overrides.keys()].some((id) => !itemByVersion.has(id))) {
        throw new ValidationError(
          'Simulated components must belong to the selected salary structure.',
        );
      }
      const versionIds = input.structureVersionId
        ? structureItems.map((item) => item.componentVersionId)
        : [...overrides.keys()];
      const versions = versionIds.length
        ? await SalaryComponentVersionModel.findAll({
            where: {
              companyId,
              id: { [Op.in]: versionIds },
              status: { [Op.in]: ['PUBLISHED', 'SUPERSEDED'] },
            },
            transaction,
          })
        : [];
      const versionsById = new Map(versions.map((version) => [version.id, version]));
      const amounts: Array<{
        componentVersionId: string;
        code: string;
        frequency: string;
        amount: string;
      }> = [];
      for (const componentVersionId of versionIds) {
        const version = versionsById.get(componentVersionId);
        const item = itemByVersion.get(componentVersionId);
        const override = overrides.get(componentVersionId);
        if (
          !version ||
          version.effectiveFrom > effectiveDate ||
          (version.effectiveTo !== null && version.effectiveTo < effectiveDate)
        ) {
          throw new ValidationError(
            'A simulated component version must be effective on the simulation date.',
          );
        }
        if (version.currency !== input.currency)
          throw new ValidationError('Simulated components must use the salary currency.');
        if (version.componentType === 'BASE_SALARY') continue;
        const component = await this.requireComponent(companyId, version.componentId, transaction);
        if (component.status !== 'ACTIVE')
          throw new ConflictError('Inactive components cannot be simulated.');
        const calculationConfig = {
          ...version.calculationConfig,
          ...(item?.calculationConfig ?? {}),
          ...(item?.percentage !== null && item?.percentage !== undefined
            ? { percentage: String(item.percentage) }
            : {}),
          ...(override?.calculationConfig ?? {}),
        };
        const amount = this.componentEvaluator.evaluate(
          {
            type: version.componentType,
            method: version.calculationMethod,
            amount:
              override?.amount ??
              (item?.amount === null || item?.amount === undefined ? null : String(item.amount)),
            percentage:
              typeof calculationConfig.percentage === 'string'
                ? calculationConfig.percentage
                : null,
            calculationConfig,
            sourceReference: override?.sourceReference ?? null,
          },
          input.baseSalary,
        );
        if (amount !== null)
          amounts.push({
            componentVersionId,
            code: component.code,
            frequency: version.frequency,
            amount,
          });
        if (
          item?.required &&
          !override &&
          item.amount === null &&
          version.componentType !== 'BASE_SALARY' &&
          version.calculationMethod !== 'PERCENTAGE' &&
          version.calculationMethod !== 'FORMULA'
        ) {
          throw new ValidationError(
            `Required component ${component.code} needs an assignment value.`,
          );
        }
      }
      const total = amounts
        .filter((component) => component.frequency !== 'ONE_TIME')
        .reduce(
          (sum, component) => sum + monthlyCents(component.amount, component.frequency),
          baseCents,
        );
      return {
        baseSalary: input.baseSalary,
        currency: input.currency,
        components: amounts,
        totalRecurring: salaryMoney(total),
        effectiveDate,
        legalTaxContributionsCalculated: false,
      };
    });
  }

  async report(
    companyId: number,
    report: 'components' | 'structures' | 'revisions',
    query: { page: number; limit: number },
  ) {
    if (report === 'components') return this.listComponents(companyId, query);
    if (report === 'structures') return this.listStructures(companyId, query);
    return this.listRevisions(companyId, query);
  }

  async requestExport(
    companyId: number,
    actorUserId: number,
    report: string,
    format: string,
    filters: Record<string, unknown>,
  ) {
    if (format !== 'CSV')
      throw new ValidationError(
        'Only CSV export requests are supported until the export worker is configured.',
      );
    return withTenant(companyId, async (transaction) => {
      const job = await this.event(
        transaction,
        companyId,
        randomUUID(),
        'salary-structure.export.requested',
        {
          eventVersion: 1,
          requestedBy: actorUserId,
          report,
          format,
          filters,
        },
      );
      return { exportId: job.id, status: 'PENDING' as const };
    });
  }

  async currentSalaryReport(companyId: number, employeeId: string, effectiveDate = today()) {
    if (!validDate(effectiveDate)) throw new ValidationError('A valid effective date is required.');
    return withTenant(companyId, async (transaction) => {
      await this.requireEmployee(companyId, employeeId, transaction);
      const assignment = await EmployeeSalaryAssignmentModel.findOne({
        where: {
          companyId,
          employeeId,
          status: 'ACTIVE',
          effectiveFrom: { [Op.lte]: effectiveDate },
          [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: effectiveDate } }],
        },
        order: [['effectiveFrom', 'DESC']],
        transaction,
      });
      if (!assignment) throw new NotFoundError('Effective salary assignment');
      const { resolved } = await this.resolveAssignedComponents(companyId, assignment, transaction);
      return { assignment, effectiveDate, components: resolved };
    });
  }

  private async resolveAssignedComponents(
    companyId: number,
    assignment: EmployeeSalaryAssignmentModel,
    transaction: Transaction,
  ) {
    const assigned = await EmployeeSalaryComponentModel.findAll({
      where: { companyId, assignmentId: assignment.id },
      transaction,
    });
    const versionIds = assigned.map((component) => component.componentVersionId);
    const versions = versionIds.length
      ? await SalaryComponentVersionModel.findAll({
          where: { companyId, id: { [Op.in]: versionIds } },
          transaction,
        })
      : [];
    const versionMap = new Map(versions.map((version) => [version.id, version]));
    const resolved: Array<Record<string, unknown>> = [
      {
        code: 'BASE_SALARY',
        type: 'BASE_SALARY',
        amount: String(assignment.baseSalary),
        currency: assignment.currency,
        sourceVersionId: assignment.structureVersionId,
      },
    ];
    for (const assignedComponent of assigned) {
      const version = versionMap.get(assignedComponent.componentVersionId);
      if (!version) throw new ConflictError('An assigned salary component version is missing.');
      if (version.componentType === 'BASE_SALARY') continue;
      const component = await this.requireComponent(companyId, version.componentId, transaction);
      const calculationConfig = {
        ...version.calculationConfig,
        ...assignedComponent.calculationConfig,
      };
      const amount = this.componentEvaluator.evaluate(
        {
          type: version.componentType,
          method: version.calculationMethod,
          amount: assignedComponent.amount === null ? null : String(assignedComponent.amount),
          percentage:
            typeof calculationConfig.percentage === 'string' ? calculationConfig.percentage : null,
          calculationConfig,
          sourceReference: assignedComponent.sourceReference,
        },
        String(assignment.baseSalary),
      );
      if (amount === null) continue;
      resolved.push({
        componentId: component.id,
        componentVersionId: version.id,
        code: component.code,
        name: component.name,
        type: version.componentType,
        calculationMethod: version.calculationMethod,
        frequency: version.frequency,
        currency: version.currency,
        amount,
        legalClassificationRef: version.legalClassificationRef,
      });
    }
    return { resolved, versionIds };
  }

  private async createAssignmentInTransaction(
    companyId: number,
    actorUserId: number,
    input: AssignmentInput,
    transaction: Transaction,
    sourceRevisionId: string | null = null,
  ) {
    const validated = await this.validateAssignment(companyId, input, transaction);
    const overlapping = await EmployeeSalaryAssignmentModel.findAll({
      where: {
        companyId,
        employeeId: input.employeeId,
        status: 'ACTIVE',
        effectiveFrom: { [Op.lte]: '9999-12-31' },
        [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: input.effectiveFrom } }],
      },
      order: [['effectiveFrom', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    for (const existing of overlapping) {
      if (existing.effectiveFrom >= input.effectiveFrom) {
        throw new ConflictError(
          'A future or same-date salary assignment already overlaps this period.',
        );
      }
      const previousDay = new Date(`${input.effectiveFrom}T00:00:00.000Z`);
      previousDay.setUTCDate(previousDay.getUTCDate() - 1);
      const effectiveTo = previousDay.toISOString().slice(0, 10);
      if (existing.effectiveFrom > effectiveTo) {
        throw new ConflictError('Salary assignment periods cannot overlap.');
      }
      await existing.update(
        { effectiveTo, version: existing.version + 1, updatedAt: now() },
        { transaction },
      );
    }
    const assignment = await EmployeeSalaryAssignmentModel.create(
      {
        id: randomUUID(),
        companyId,
        employeeId: input.employeeId,
        contractId: input.contractId,
        structureVersionId: input.structureVersionId,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
        baseSalary: salaryMoney(salaryCents(input.baseSalary)),
        currency: input.currency,
        status: 'ACTIVE',
        version: 1,
        createdBy: actorUserId,
        sourceRevisionId,
        createdAt: now(),
        updatedAt: now(),
      },
      { transaction },
    );
    for (const component of validated.components) {
      const chosen = validated.inputComponents.get(component.version.id);
      const item = validated.structureItems.get(component.version.id);
      const amount = chosen?.amount ?? item?.amount ?? null;
      const config = {
        ...component.version.calculationConfig,
        ...(item?.calculationConfig ?? {}),
        ...(chosen?.calculationConfig ?? {}),
        ...(item?.percentage !== null && item?.percentage !== undefined
          ? { percentage: String(item.percentage) }
          : {}),
      };
      await EmployeeSalaryComponentModel.create(
        {
          id: randomUUID(),
          companyId,
          assignmentId: assignment.id,
          componentVersionId: component.version.id,
          amount,
          calculationConfig: config,
          sourceReference: chosen?.sourceReference ?? null,
          createdAt: now(),
        },
        { transaction },
      );
    }
    await this.event(
      transaction,
      companyId,
      assignment.id,
      sourceRevisionId
        ? 'salary-structure.assignment.changed'
        : 'salary-structure.assignment.created',
      {
        eventVersion: 1,
        employeeId: assignment.employeeId,
        contractId: assignment.contractId,
        structureVersionId: assignment.structureVersionId,
        effectiveFrom: assignment.effectiveFrom,
        sourceRevisionId,
      },
    );
    return assignment;
  }

  private async validateAssignment(
    companyId: number,
    input: AssignmentInput,
    transaction: Transaction,
    allowCurrentAssignment = false,
  ) {
    if (!validDate(input.effectiveFrom))
      throw new ValidationError('A valid salary effective date is required.');
    const baseCents = salaryCents(input.baseSalary);
    if (baseCents <= 0n) throw new ValidationError('Base salary must be greater than zero.');
    const { employee, contract } = await this.requireEmployeeAndContract(
      companyId,
      input.employeeId,
      input.contractId,
      input.effectiveFrom,
      transaction,
    );
    void employee;
    if (contract.currency !== input.currency)
      throw new ValidationError('Salary assignment currency must match the employment contract.');
    if (
      contract.salaryAmount !== null &&
      salaryCents(String(contract.salaryAmount)) !== baseCents
    ) {
      throw new ConflictError(
        'Base salary must match the active contract; amend the contract before changing contractual pay.',
      );
    }
    const version = await SalaryStructureVersionModel.findOne({
      where: {
        id: input.structureVersionId,
        companyId,
        status: { [Op.in]: ['PUBLISHED', 'SCHEDULED', 'SUPERSEDED'] },
        effectiveFrom: { [Op.lte]: input.effectiveFrom },
        [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: input.effectiveFrom } }],
      },
      transaction,
    });
    if (!version)
      throw new ValidationError(
        'A published structure version must be effective on the assignment date.',
      );
    if (
      version.status === 'SCHEDULED' &&
      version.effectiveFrom > today() &&
      version.effectiveFrom !== input.effectiveFrom
    ) {
      throw new ValidationError(
        'The scheduled salary structure is not effective on the requested assignment date.',
      );
    }
    const structureItems = await SalaryStructureItemModel.findAll({
      where: { companyId, structureVersionId: version.id },
      transaction,
    });
    if (!structureItems.length)
      throw new ConflictError('The published structure has no salary components.');
    const itemByVersion = new Map(structureItems.map((item) => [item.componentVersionId, item]));
    const overrides = new Map(input.components.map((item) => [item.componentVersionId, item]));
    if (overrides.size !== input.components.length)
      throw new ValidationError('A salary component can only be assigned once.');
    for (const componentVersionId of overrides.keys()) {
      if (!itemByVersion.has(componentVersionId))
        throw new ValidationError(
          'Assigned components must belong to the selected salary structure.',
        );
    }
    const versions = await SalaryComponentVersionModel.findAll({
      where: {
        companyId,
        id: { [Op.in]: structureItems.map((item) => item.componentVersionId) },
        status: { [Op.in]: ['PUBLISHED', 'SUPERSEDED'] },
      },
      transaction,
    });
    const versionsById = new Map(versions.map((item) => [item.id, item]));
    const result: Array<{
      version: SalaryComponentVersionModel;
      component: SalaryComponentModel;
      calculation: SalaryCalculationComponent;
    }> = [];
    for (const item of structureItems) {
      const componentVersion = versionsById.get(item.componentVersionId);
      if (
        !componentVersion ||
        componentVersion.effectiveFrom > input.effectiveFrom ||
        (componentVersion.effectiveTo !== null &&
          componentVersion.effectiveTo < input.effectiveFrom)
      ) {
        throw new ConflictError(
          'The structure references a component version that is not effective on this date.',
        );
      }
      const component = await this.requireComponent(
        companyId,
        componentVersion.componentId,
        transaction,
      );
      if (component.status !== 'ACTIVE')
        throw new ConflictError('Inactive components cannot be assigned.');
      if (componentVersion.currency !== input.currency)
        throw new ValidationError('All assigned salary components must use the contract currency.');
      const override = overrides.get(componentVersion.id);
      const amount = override?.amount ?? (item.amount === null ? null : String(item.amount));
      const calculationConfig = {
        ...componentVersion.calculationConfig,
        ...item.calculationConfig,
        ...(item.percentage !== null ? { percentage: String(item.percentage) } : {}),
        ...(override?.calculationConfig ?? {}),
      };
      const calculation: SalaryCalculationComponent = {
        type: componentVersion.componentType,
        method: componentVersion.calculationMethod,
        amount,
        percentage:
          typeof calculationConfig.percentage === 'string' ? calculationConfig.percentage : null,
        calculationConfig,
        sourceReference: override?.sourceReference ?? null,
      };
      if (
        item.required &&
        !override &&
        amount === null &&
        componentVersion.componentType !== 'BASE_SALARY' &&
        componentVersion.calculationMethod !== 'PERCENTAGE' &&
        componentVersion.calculationMethod !== 'FORMULA'
      ) {
        throw new ValidationError(
          `Required component ${component.code} needs an assignment value.`,
        );
      }
      this.componentEvaluator.evaluate(calculation, input.baseSalary);
      result.push({ version: componentVersion, component, calculation });
    }
    if (!allowCurrentAssignment) {
      const overlapping = await EmployeeSalaryAssignmentModel.findOne({
        where: {
          companyId,
          employeeId: input.employeeId,
          status: 'ACTIVE',
          effectiveFrom: { [Op.lte]: '9999-12-31' },
          [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: input.effectiveFrom } }],
        },
        transaction,
      });
      if (overlapping && overlapping.effectiveFrom >= input.effectiveFrom) {
        throw new ConflictError(
          'A future or same-date salary assignment already overlaps this period.',
        );
      }
    }
    return {
      components: result,
      structureItems: itemByVersion,
      inputComponents: overrides,
      version,
    };
  }

  private async requireEmployeeAndContract(
    companyId: number,
    employeeId: string,
    contractId: string,
    effectiveDate: string,
    transaction: Transaction,
  ) {
    const employee = await EmployeeModel.findOne({
      where: { id: employeeId, companyId, status: 'ACTIVE' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!employee) throw new NotFoundError('Active employee');
    const contract = await EmploymentContractModel.findOne({
      where: {
        id: contractId,
        companyId,
        employeeId,
        status: 'ACTIVE',
        startDate: { [Op.lte]: effectiveDate },
        [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: effectiveDate } }],
      },
      transaction,
    });
    if (!contract)
      throw new ValidationError(
        'An active employment contract for this employee and effective date is required.',
      );
    return { employee, contract };
  }

  private async validateStructureItems(
    companyId: number,
    items: StructureItemInput[],
    effectiveDate: string,
    transaction: Transaction,
  ) {
    if (new Set(items.map((item) => item.componentVersionId)).size !== items.length) {
      throw new ValidationError(
        'A salary structure cannot include the same component version twice.',
      );
    }
    const versions = await SalaryComponentVersionModel.findAll({
      where: {
        companyId,
        id: { [Op.in]: items.map((item) => item.componentVersionId) },
        status: { [Op.in]: ['PUBLISHED', 'SUPERSEDED'] },
        effectiveFrom: { [Op.lte]: effectiveDate },
        [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: effectiveDate } }],
      },
      transaction,
    });
    if (versions.length !== items.length)
      throw new ValidationError(
        'Structure items must use published component versions from this company.',
      );
    if (versions.filter((version) => version.componentType === 'BASE_SALARY').length > 1) {
      throw new ValidationError(
        'A salary structure can include at most one base salary component.',
      );
    }
    const versionMap = new Map(versions.map((version) => [version.id, version]));
    for (const item of items) {
      const version = versionMap.get(item.componentVersionId);
      if (!version) continue;
      const hasAmount = item.amount !== undefined;
      const hasPercentage = item.percentage !== undefined;
      if (
        version.calculationMethod === 'FIXED_AMOUNT' &&
        !hasAmount &&
        version.componentType !== 'BASE_SALARY'
      ) {
        throw new ValidationError('Fixed salary structure items require an amount.');
      }
      if (version.calculationMethod === 'PERCENTAGE' && !hasPercentage) {
        throw new ValidationError('Percentage salary structure items require a percentage.');
      }
      if (
        version.calculationMethod === 'FORMULA' &&
        (version.calculationConfig.operation !== 'PERCENT_OF_BASE' ||
          typeof version.calculationConfig.percentage !== 'string')
      ) {
        throw new ValidationError(
          'Formula component must use the supported PERCENT_OF_BASE expression.',
        );
      }
      if (version.calculationMethod === 'VARIABLE_INPUT' && hasAmount) {
        throw new ValidationError(
          'Variable input amounts are provided per employee assignment, not by the structure.',
        );
      }
    }
  }

  private async createStructureItems(
    companyId: number,
    versionId: string,
    items: StructureItemInput[],
    transaction: Transaction,
  ) {
    await SalaryStructureItemModel.bulkCreate(
      items.map((item) => ({
        id: randomUUID(),
        companyId,
        structureVersionId: versionId,
        componentVersionId: item.componentVersionId,
        amount: item.amount ?? null,
        percentage: item.percentage ?? null,
        calculationConfig: item.calculationConfig,
        required: item.required,
        createdAt: now(),
      })),
      { transaction },
    );
  }

  private validateItems(items: StructureItemInput[]) {
    if (!items.length || items.length > 200)
      throw new ValidationError('A salary structure must contain between 1 and 200 components.');
  }

  private validateVersion(input: VersionInput) {
    if (!validDate(input.effectiveFrom))
      throw new ValidationError('A valid component effective date is required.');
    if (!/^[A-Z]{3}$/.test(input.currency))
      throw new ValidationError('A valid ISO currency is required.');
    const allowedMethods = [
      'FIXED_AMOUNT',
      'PERCENTAGE',
      'VARIABLE_INPUT',
      'FORMULA',
      'CONDITIONAL',
      'ONE_TIME',
    ];
    if (!allowedMethods.includes(input.calculationMethod))
      throw new ValidationError('Unsupported salary component calculation method.');
    if (
      input.calculationMethod === 'FORMULA' &&
      (input.calculationConfig.operation !== 'PERCENT_OF_BASE' ||
        typeof input.calculationConfig.percentage !== 'string')
    ) {
      throw new ValidationError(
        'Formula component must use the supported PERCENT_OF_BASE expression.',
      );
    }
  }

  private async createComponentVersionInTransaction(
    companyId: number,
    actorUserId: number,
    component: SalaryComponentModel,
    input: VersionInput,
    transaction: Transaction,
  ) {
    const latest = await SalaryComponentVersionModel.findOne({
      where: { companyId, componentId: component.id },
      order: [['version', 'DESC']],
      transaction,
    });
    return SalaryComponentVersionModel.create(
      {
        id: randomUUID(),
        companyId,
        componentId: component.id,
        version: (latest?.version ?? 0) + 1,
        componentType: input.componentType,
        calculationMethod: input.calculationMethod,
        frequency: input.frequency,
        currency: input.currency,
        legalClassificationRef: input.legalClassificationRef ?? null,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null,
        calculationConfig: input.calculationConfig,
        status: 'DRAFT',
        createdBy: actorUserId,
        createdAt: now(),
      },
      { transaction },
    );
  }

  private async ensureNoVersionOverlap<T extends Model>(
    model: ModelStatic<T>,
    companyId: number,
    parentKey: string,
    parentId: string,
    effectiveFrom: string,
    effectiveTo: string | null,
    excludedId: string,
    transaction: Transaction,
    statuses: string[] = ['PUBLISHED', 'SCHEDULED'],
  ) {
    const preceding = await model.findAll({
      where: {
        companyId,
        [parentKey]: parentId,
        id: { [Op.ne]: excludedId },
        status: { [Op.in]: statuses },
        effectiveFrom: { [Op.lt]: effectiveFrom },
        [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: effectiveFrom } }],
      } as WhereOptions<Attributes<T>>,
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (preceding.length) {
      const previousDate = new Date(`${effectiveFrom}T00:00:00.000Z`);
      previousDate.setUTCDate(previousDate.getUTCDate() - 1);
      const effectiveTo = previousDate.toISOString().slice(0, 10);
      for (const version of preceding) {
        await version.update({ effectiveTo, status: 'SUPERSEDED' } as Partial<Attributes<T>>, {
          transaction,
        });
      }
    }
    const where: Record<string | symbol, unknown> = {
      companyId,
      [parentKey]: parentId,
      id: { [Op.ne]: excludedId },
      status: { [Op.in]: statuses },
      effectiveFrom: { [Op.lte]: effectiveTo ?? '9999-12-31' },
      [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: effectiveFrom } }],
    };
    const overlapping = await model.findOne({
      where: where as WhereOptions<Attributes<T>>,
      transaction,
      lock: transaction.LOCK.UPDATE,
    } as FindOptions<Attributes<T>>);
    if (overlapping)
      throw new ConflictError(
        'Published salary versions cannot have overlapping effective periods.',
      );
  }

  private async getRevisionBatchInTransaction(
    companyId: number,
    id: string,
    transaction: Transaction,
  ) {
    const batch = await this.requireBatch(companyId, id, transaction);
    const items = await SalaryRevisionItemModel.findAll({
      where: { companyId, batchId: id },
      order: [['createdAt', 'ASC']],
      transaction,
    });
    return { ...batch.toJSON(), items };
  }

  private async latestStructureVersion(
    companyId: number,
    structureId: string,
    transaction: Transaction,
    lock = false,
  ) {
    await this.requireStructure(companyId, structureId, transaction);
    const version = await SalaryStructureVersionModel.findOne({
      where: { companyId, structureId },
      order: [['version', 'DESC']],
      transaction,
      ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!version) throw new NotFoundError('Salary structure version');
    return version;
  }

  private async requireEmployee(companyId: number, id: string, transaction: Transaction) {
    const employee = await EmployeeModel.findOne({ where: { companyId, id }, transaction });
    if (!employee) throw new NotFoundError('Employee');
    return employee;
  }

  private async requireComponent(
    companyId: number,
    id: string,
    transaction: Transaction,
    lock = false,
  ) {
    const row = await SalaryComponentModel.findOne({
      where: { companyId, id },
      transaction,
      ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!row) throw new NotFoundError('Salary component');
    return row;
  }

  private async requireTable(
    companyId: number,
    id: string,
    transaction: Transaction,
    lock = false,
  ) {
    const row = await SalaryTableModel.findOne({
      where: { companyId, id },
      transaction,
      ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!row) throw new NotFoundError('Salary table');
    return row;
  }

  private async requireStructure(
    companyId: number,
    id: string,
    transaction: Transaction,
    lock = false,
  ) {
    const row = await SalaryStructureModel.findOne({
      where: { companyId, id },
      transaction,
      ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!row) throw new NotFoundError('Salary structure');
    return row;
  }

  private async requireAssignment(
    companyId: number,
    id: string,
    transaction: Transaction,
    lock = false,
  ) {
    const row = await EmployeeSalaryAssignmentModel.findOne({
      where: { companyId, id },
      transaction,
      ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!row) throw new NotFoundError('Salary assignment');
    return row;
  }

  private async requireRevision(
    companyId: number,
    id: string,
    transaction: Transaction,
    lock = false,
  ) {
    const row = await SalaryRevisionModel.findOne({
      where: { companyId, id },
      transaction,
      ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!row) throw new NotFoundError('Salary revision');
    return row;
  }

  private async requireBatch(
    companyId: number,
    id: string,
    transaction: Transaction,
    lock = false,
  ) {
    const row = await SalaryRevisionBatchModel.findOne({
      where: { companyId, id },
      transaction,
      ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!row) throw new NotFoundError('Salary revision batch');
    return row;
  }

  private async event(
    transaction: Transaction,
    companyId: number,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    return SalaryOutboxModel.create(
      {
        companyId,
        aggregateId,
        eventType,
        payload,
        occurredAt: now(),
        publishedAt: null,
      },
      { transaction },
    );
  }

  private mapUnique(error: unknown, message: string): never {
    if (error instanceof UniqueConstraintError) throw new ConflictError(message);
    throw error;
  }
}
