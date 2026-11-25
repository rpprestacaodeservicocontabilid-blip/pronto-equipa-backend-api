import { randomUUID } from 'node:crypto';
import { Transaction } from 'sequelize';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../../shared/errors/app.error';
import { EmployeeEntity } from '../../../domain/entities/employee.entity';
import { createEmployeeSchema } from '../../../presentation/schemas/employee.schema';
import type { ProfileSection } from '../../../presentation/schemas/employee-administration.schema';
import { EmployeeProfileSectionModel, EmployeeRegistrationModel, RegistrationState } from '../models/employee-administration.model';
import { EmployeeModel } from '../models/employee.model';
import { inTenantTransaction, SequelizeEmployeeRepository } from './sequelize-employee.repository';

interface Actor { companyId: number; userId: number }
const pageSize = 25;

export class EmployeeAdministrationRepository {
  constructor(private readonly employees: SequelizeEmployeeRepository) {}

  async profile(companyId: number, employeeId: string, section: ProfileSection) {
    return inTenantTransaction(companyId, async transaction => {
      await this.requireEmployee(companyId, employeeId, transaction);
      const row = await EmployeeProfileSectionModel.findOne({ where: { companyId, employeeId, section }, transaction });
      return { version: row?.version ?? 0, content: row?.content ?? {} };
    });
  }

  async saveProfile(companyId: number, employeeId: string, section: ProfileSection, expected: number, content: object) {
    return inTenantTransaction(companyId, async transaction => {
      await this.requireEmployee(companyId, employeeId, transaction, true);
      const key = { companyId, employeeId, section };
      const row = await EmployeeProfileSectionModel.findOne({ where: key, transaction });
      if ((row?.version ?? 0) !== expected) throw new ConflictError('This section changed. Reload it before editing.');
      const values = { content, version: expected + 1 };
      if (row) await row.update(values, { transaction });
      else await EmployeeProfileSectionModel.create({ ...key, ...values }, { transaction });
      return values;
    });
  }

  async list(companyId: number, page: number, status?: RegistrationState) {
    return inTenantTransaction(companyId, async transaction => {
      const { rows, count } = await EmployeeRegistrationModel.findAndCountAll({
        where: { companyId, ...(status ? { status } : {}) },
        order: [['updatedAt', 'DESC'], ['id', 'ASC']], transaction,
        limit: pageSize, offset: (page - 1) * pageSize,
      });
      return { items: rows.map(row => this.summary(row)), total: count, page, limit: pageSize };
    });
  }

  async registration(companyId: number, id: string) {
    return inTenantTransaction(companyId, async transaction => {
      const row = await this.requireRegistration(companyId, id, transaction);
      return this.present(row);
    });
  }

  async createDraft(actor: Actor, content: Record<string, unknown>) {
    return inTenantTransaction(actor.companyId, async transaction => {
      const row = await EmployeeRegistrationModel.create({
        id: randomUUID(), companyId: actor.companyId, createdBy: actor.userId,
        content, status: 'DRAFT', version: 1,
      }, { transaction });
      return this.present(row);
    });
  }

  async editDraft(actor: Actor, id: string, version: number, content: Record<string, unknown>) {
    return this.change(actor, id, version, async (row, transaction) => {
      this.requireOwnerDraft(row, actor.userId);
      await row.update({ content, version: version + 1 }, { transaction });
    });
  }

  async transition(actor: Actor, id: string, version: number, action: 'submit' | 'approve' | 'reject', reason?: string) {
    return this.change(actor, id, version, async (row, transaction) => {
      if (action === 'submit') {
        this.requireOwnerDraft(row, actor.userId);
        this.employee(row);
        await row.update({ status: 'PENDING', version: version + 1 }, { transaction });
        return;
      }
      if (row.status !== 'PENDING') throw new ConflictError('Only pending registrations can be reviewed.');
      if (row.createdBy === actor.userId) throw new ForbiddenError('A different operator must review this registration.');
      if (action === 'reject' && !reason) throw new ValidationError('Rejection requires a reason.');
      if (action === 'approve') await this.employees.create(this.employee(row), actor.userId, transaction);
      await row.update({
        status: action === 'approve' ? 'APPROVED' : 'REJECTED', reviewedBy: actor.userId,
        decisionReason: reason ?? null, version: version + 1,
      }, { transaction });
    });
  }

  private async change(actor: Actor, id: string, version: number,
    apply: (row: EmployeeRegistrationModel, transaction: Transaction) => Promise<void>) {
    return inTenantTransaction(actor.companyId, async transaction => {
      const row = await this.requireRegistration(actor.companyId, id, transaction, true);
      if (row.version !== version) throw new ConflictError('Registration changed. Reload it before continuing.');
      await apply(row, transaction);
      return this.present(row);
    });
  }

  private requireOwnerDraft(row: EmployeeRegistrationModel, userId: number) {
    if (row.createdBy !== userId) throw new ForbiddenError('Only the author can modify or submit the draft.');
    if (row.status !== 'DRAFT') throw new ConflictError('Only a draft can be modified or submitted.');
  }

  private employee(row: EmployeeRegistrationModel) {
    const validated = createEmployeeSchema.parse(row.content);
    try { return EmployeeEntity.create({ ...validated, companyId: row.companyId, id: row.id }); }
    catch (error) { throw new ValidationError(error instanceof Error ? error.message : 'Invalid employee registration.'); }
  }

  private async requireRegistration(companyId: number, id: string, transaction: Transaction, lock = false) {
    const row = await EmployeeRegistrationModel.findOne({
      where: { companyId, id }, transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!row) throw new NotFoundError('Employee registration');
    return row;
  }

  private async requireEmployee(companyId: number, id: string, transaction: Transaction, lock = false) {
    const employee = await EmployeeModel.findOne({
      where: { companyId, id }, attributes: ['id'], transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!employee) throw new NotFoundError('Employee');
  }

  private summary(row: EmployeeRegistrationModel) {
    const { id, status, version, createdBy, reviewedBy, decisionReason, updatedAt, content } = row;
    const { employeeNumber, firstName, lastName } = content;
    return { id, status, version, createdBy, reviewedBy, decisionReason, updatedAt, employeeNumber, firstName, lastName,
      employeeId: status === 'APPROVED' ? id : null };
  }

  private present(row: EmployeeRegistrationModel) {
    return { ...this.summary(row), content: row.content };
  }
}
