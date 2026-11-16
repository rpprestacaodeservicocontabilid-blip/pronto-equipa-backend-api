import { Op, QueryTypes, Transaction, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../../shared/errors/app.error';
import { EmployeeModel } from '../../../../employees/infrastructure/persistence/models/employee.model';
import {
  EmploymentContract,
  EmploymentContractProps,
} from '../../../domain/aggregates/employment-contract.aggregate';
import {
  ContractListQuery,
  ContractRecord,
  ContractRepository,
  ContractType,
} from '../../../domain/repositories/contract.repository';
import { ContractPeriod } from '../../../domain/value-objects/contract-period.vo';
import { ContractOutboxModel } from '../models/contract-outbox.model';
import { ContractAlertModel } from '../models/contract-alert.model';
import { ContractRecordModel } from '../models/contract-record.model';
import { ContractTypeModel } from '../models/contract-type.model';
import { EmploymentContractModel } from '../models/employment-contract.model';

const mapContract = (row: EmploymentContractModel): EmploymentContractProps => ({
  id: row.id,
  companyId: row.companyId,
  employeeId: row.employeeId,
  contractNumber: row.contractNumber,
  typeCode: row.typeCode,
  legalRuleVersionId: row.legalRuleVersionId,
  status: row.status,
  startDate: String(row.startDate).slice(0, 10),
  endDate: row.endDate ? String(row.endDate).slice(0, 10) : null,
  currency: row.currency,
  salaryAmount: row.salaryAmount === null ? null : String(row.salaryAmount),
  terms: row.terms,
  version: row.version,
});

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

const typeToEvent: Record<string, string> = {
  SUBMITTED: 'contracts.submitted',
  APPROVED: 'contracts.approved',
  REJECTED: 'contracts.rejected',
  ACTIVE: 'contracts.activated',
  RENEWAL: 'contracts.renewed',
  AMENDMENT: 'contracts.amended',
  SUSPENSION: 'contracts.suspended',
  RESUMPTION: 'contracts.resumed',
  TERMINATION: 'contracts.terminated',
  EXPIRED: 'contracts.expired',
  CANCELLED: 'contracts.cancelled',
  ARCHIVE: 'contracts.archived',
};

export class SequelizeContractRepository implements ContractRepository {
  async create(
    contract: EmploymentContractProps,
    actorUserId: number,
  ): Promise<EmploymentContractProps> {
    return withTenant(contract.companyId, async (transaction) => {
      const employee = await EmployeeModel.findOne({
        where: { id: contract.employeeId, companyId: contract.companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!employee) throw new NotFoundError('Employee');

      const type = await ContractTypeModel.findOne({
        where: {
          code: contract.typeCode,
          active: true,
          [Op.or]: [{ companyId: contract.companyId }, { companyId: null }],
        },
        transaction,
      });
      if (!type) throw new ValidationError('Contract type is inactive or unavailable.');
      if (type.requiresEndDate && !contract.endDate) {
        throw new ValidationError('This contract type requires an end date.');
      }
      const contractWithLegalRule = { ...contract, legalRuleVersionId: type.legalRuleVersionId };

      const overlapping = await EmploymentContractModel.findOne({
        where: {
          companyId: contract.companyId,
          employeeId: contract.employeeId,
          status: { [Op.in]: ['PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUSPENDED'] },
          startDate: { [Op.lte]: contract.endDate ?? '9999-12-31' },
          [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: contract.startDate } }],
        },
        transaction,
      });
      if (overlapping)
        throw new ConflictError('An incompatible contract already overlaps this period.');

      let row: EmploymentContractModel;
      try {
        row = await EmploymentContractModel.create(
          { ...contractWithLegalRule, createdAt: new Date(), updatedAt: new Date() },
          { transaction },
        );
      } catch (error) {
        if (error instanceof UniqueConstraintError) {
          throw new ConflictError('Contract number already exists in this company.');
        }
        throw error;
      }
      const now = new Date();
      await ContractRecordModel.create(
        {
          companyId: contract.companyId,
          contractId: contract.id,
          type: 'CREATED',
          actorUserId,
          payload: { snapshot: contractWithLegalRule },
          createdAt: now,
        },
        { transaction },
      );
      await ContractOutboxModel.create(
        {
          companyId: contract.companyId,
          aggregateId: contract.id,
          eventType: 'contracts.created',
          payload: { contractId: contract.id, employeeId: contract.employeeId },
          occurredAt: now,
          publishedAt: null,
        },
        { transaction },
      );
      return mapContract(row);
    });
  }

  async find(companyId: number, id: string): Promise<EmploymentContractProps | null> {
    return withTenant(companyId, async (transaction) => {
      const row = await EmploymentContractModel.findOne({ where: { id, companyId }, transaction });
      return row ? mapContract(row) : null;
    });
  }

  async list(companyId: number, query: ContractListQuery) {
    return withTenant(companyId, async (transaction) => {
      const where: Record<string | symbol, unknown> = { companyId };
      if (query.employeeId) where.employeeId = query.employeeId;
      if (query.status) where.status = query.status;
      if (query.typeCode) where.typeCode = query.typeCode;
      if (query.expiringWithinDays !== undefined) {
        const now = new Date().toISOString().slice(0, 10);
        const until = new Date(Date.now() + query.expiringWithinDays * 86400000)
          .toISOString()
          .slice(0, 10);
        where.status = 'ACTIVE';
        where.endDate = { [Op.between]: [now, until] };
      }
      const result = await EmploymentContractModel.findAndCountAll({
        where,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        order: [
          ['endDate', 'ASC'],
          ['createdAt', 'DESC'],
        ],
        transaction,
      });
      return {
        data: result.rows.map(mapContract),
        pagination: {
          page: query.page,
          limit: query.limit,
          total: result.count,
          totalPages: Math.ceil(result.count / query.limit),
        },
      };
    });
  }

  async updateDraft(
    companyId: number,
    id: string,
    expectedVersion: number,
    changes: Partial<
      Pick<
        EmploymentContractProps,
        | 'typeCode'
        | 'legalRuleVersionId'
        | 'startDate'
        | 'endDate'
        | 'currency'
        | 'salaryAmount'
        | 'terms'
      >
    >,
    actorUserId: number,
  ): Promise<EmploymentContractProps> {
    return withTenant(companyId, async (transaction) => {
      const row = await this.lockContract(companyId, id, transaction);
      if (row.status !== 'DRAFT')
        throw new ConflictError('Only draft contracts can be edited directly.');
      this.assertVersion(row, expectedVersion);
      if (changes.typeCode) {
        const type = await ContractTypeModel.findOne({
          where: {
            code: changes.typeCode,
            active: true,
            [Op.or]: [{ companyId }, { companyId: null }],
          },
          transaction,
        });
        if (!type) throw new ValidationError('Contract type is inactive or unavailable.');
        if (type.requiresEndDate && !(changes.endDate ?? row.endDate)) {
          throw new ValidationError('This contract type requires an end date.');
        }
        changes.legalRuleVersionId = type.legalRuleVersionId;
      }
      const updated = { ...mapContract(row), ...changes, version: row.version + 1 };
      ContractPeriod.create(updated.startDate, updated.endDate);
      if (!/^[A-Z]{3}$/.test(updated.currency)) {
        throw new ValidationError('Currency must be a three-letter ISO code.');
      }
      if (
        updated.salaryAmount !== null &&
        (!/^\d+(\.\d{1,2})?$/.test(updated.salaryAmount) || Number(updated.salaryAmount) < 0)
      ) {
        throw new ValidationError('Contract salary must be a non-negative amount.');
      }
      const now = new Date();
      await row.update({ ...changes, version: updated.version, updatedAt: now }, { transaction });
      await this.record(transaction, companyId, id, 'DRAFT_UPDATED', actorUserId, {
        changes,
        snapshot: updated,
      });
      await ContractOutboxModel.create(
        {
          companyId,
          aggregateId: id,
          eventType: 'contracts.draft_updated',
          payload: { contractId: id, version: updated.version },
          occurredAt: now,
          publishedAt: null,
        },
        { transaction },
      );
      return updated;
    });
  }

  async transition(
    companyId: number,
    id: string,
    expectedVersion: number,
    status: EmploymentContractProps['status'],
    recordType: string,
    actorUserId: number,
    payload: Record<string, unknown> = {},
  ): Promise<EmploymentContractProps> {
    return withTenant(companyId, async (transaction) => {
      const row = await this.lockContract(companyId, id, transaction);
      this.assertVersion(row, expectedVersion);
      const current = mapContract(row);
      const aggregate = EmploymentContract.restore(current);
      if (status === 'ACTIVE' && current.startDate > new Date().toISOString().slice(0, 10)) {
        throw new ConflictError('A contract cannot be activated before its start date.');
      }
      const changed = aggregate.transition(status);
      if (
        status === 'ACTIVE' &&
        changed.endDate &&
        changed.endDate < new Date().toISOString().slice(0, 10)
      ) {
        throw new ConflictError('An expired contract cannot be activated.');
      }
      const now = new Date();
      await row.update({ status, version: changed.version, updatedAt: now }, { transaction });
      await this.record(transaction, companyId, id, recordType, actorUserId, {
        ...payload,
        snapshot: { ...current, ...changed },
      });
      await ContractOutboxModel.create(
        {
          companyId,
          aggregateId: id,
          eventType: typeToEvent[recordType] ?? `contracts.${recordType.toLowerCase()}`,
          payload: { contractId: id, employeeId: row.employeeId, status, ...payload },
          occurredAt: now,
          publishedAt: null,
        },
        { transaction },
      );
      return { ...current, status, version: changed.version };
    });
  }

  async addRecord(
    companyId: number,
    id: string,
    expectedVersion: number,
    recordType: string,
    actorUserId: number,
    payload: Record<string, unknown>,
  ): Promise<EmploymentContractProps> {
    return withTenant(companyId, async (transaction) => {
      const row = await this.lockContract(companyId, id, transaction);
      this.assertVersion(row, expectedVersion);
      const archiveAllowed =
        recordType === 'ARCHIVE' && ['EXPIRED', 'TERMINATED'].includes(row.status);
      if (
        !['ACTIVE', 'SUSPENDED'].includes(row.status) &&
        recordType !== 'DOCUMENT' &&
        !archiveAllowed
      ) {
        throw new ConflictError('This operation requires an effective contract.');
      }
      const current = mapContract(row);
      const changes = (payload.changes ?? {}) as Partial<EmploymentContractProps>;
      const updated: EmploymentContractProps = {
        ...current,
        ...changes,
        version: row.version + 1,
      };
      if (recordType === 'RENEWAL') {
        const endDate = String(payload.newEndDate ?? '');
        if (current.status !== 'ACTIVE')
          throw new ConflictError('Only an active contract can be renewed.');
        if (
          !current.endDate ||
          endDate <= current.endDate ||
          endDate < new Date().toISOString().slice(0, 10)
        ) {
          throw new ValidationError('Renewal end date must extend the current contract term.');
        }
        const type = await ContractTypeModel.findOne({
          where: {
            code: current.typeCode,
            active: true,
            [Op.or]: [{ companyId }, { companyId: null }],
          },
          transaction,
        });
        if (!type) throw new ValidationError('Contract type is no longer available.');
        if (type.maxRenewals !== null) {
          const count = await ContractRecordModel.count({
            where: { companyId, contractId: id, type: 'RENEWAL' },
            transaction,
          });
          if (count >= type.maxRenewals)
            throw new ConflictError('Maximum contract renewals reached.');
        }
        updated.endDate = endDate;
      } else if (recordType === 'AMENDMENT') {
        const effectiveDate = String(payload.effectiveDate ?? '');
        if (effectiveDate < new Date().toISOString().slice(0, 10)) {
          throw new ValidationError('Retroactive amendments are not permitted.');
        }
      } else if (recordType === 'SUSPENSION' && current.status !== 'ACTIVE') {
        throw new ConflictError('Only an active contract can be suspended.');
      }

      const now = new Date();
      await row.update(
        {
          endDate: updated.endDate,
          salaryAmount: updated.salaryAmount,
          terms: updated.terms,
          version: updated.version,
          updatedAt: now,
        },
        { transaction },
      );
      if (recordType === 'SUSPENSION') {
        await row.update({ status: 'SUSPENDED' }, { transaction });
        updated.status = 'SUSPENDED';
      }
      await this.record(transaction, companyId, id, recordType, actorUserId, {
        ...payload,
        snapshot: updated,
      });
      await ContractOutboxModel.create(
        {
          companyId,
          aggregateId: id,
          eventType: typeToEvent[recordType] ?? `contracts.${recordType.toLowerCase()}`,
          payload: { contractId: id, employeeId: row.employeeId, ...payload },
          occurredAt: now,
          publishedAt: null,
        },
        { transaction },
      );
      return updated;
    });
  }

  async records(companyId: number, id: string, type?: string): Promise<ContractRecord[]> {
    return withTenant(companyId, async (transaction) => {
      const rows = await ContractRecordModel.findAll({
        where: { companyId, contractId: id, ...(type ? { type } : {}) },
        order: [
          ['createdAt', 'ASC'],
          ['id', 'ASC'],
        ],
        transaction,
      });
      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        actorUserId: row.actorUserId,
        createdAt: row.createdAt,
        payload: row.payload,
      }));
    });
  }

  async listTypes(companyId: number): Promise<ContractType[]> {
    return withTenant(companyId, async (transaction) => {
      const rows = await ContractTypeModel.findAll({
        where: { active: true, [Op.or]: [{ companyId }, { companyId: null }] },
        order: [['name', 'ASC']],
        transaction,
      });
      return rows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        code: row.code,
        name: row.name,
        legalRuleVersionId: row.legalRuleVersionId,
        requiresEndDate: row.requiresEndDate,
        maxRenewals: row.maxRenewals,
        active: row.active,
      }));
    });
  }

  async createType(
    companyId: number,
    input: Omit<ContractType, 'id' | 'companyId'>,
  ): Promise<ContractType> {
    return withTenant(companyId, async (transaction) => {
      const existing = await ContractTypeModel.findOne({
        where: { companyId, code: input.code },
        transaction,
      });
      if (existing) throw new ConflictError('Contract type code already exists in this company.');
      const row = await ContractTypeModel.create(
        { ...input, companyId, createdAt: new Date(), updatedAt: new Date() },
        { transaction },
      );
      return {
        id: row.id,
        companyId: row.companyId,
        code: row.code,
        name: row.name,
        legalRuleVersionId: row.legalRuleVersionId,
        requiresEndDate: row.requiresEndDate,
        maxRenewals: row.maxRenewals,
        active: row.active,
      };
    });
  }

  async verifyEmployee(companyId: number, employeeId: string): Promise<boolean> {
    return withTenant(companyId, async (transaction) =>
      Boolean(
        await EmployeeModel.findOne({
          where: { companyId, id: employeeId },
          attributes: ['id'],
          transaction,
        }),
      ),
    );
  }

  async generateExpirationAlerts(companyId: number, asOfDate: string): Promise<number> {
    return withTenant(companyId, async (transaction) => {
      let generated = 0;
      const thresholds = [30, 15, 7] as const;
      for (const days of thresholds) {
        const target = new Date(`${asOfDate}T00:00:00.000Z`);
        target.setUTCDate(target.getUTCDate() + days);
        const targetDate = target.toISOString().slice(0, 10);
        const expiring = await EmploymentContractModel.findAll({
          where: { companyId, status: 'ACTIVE', endDate: targetDate },
          transaction,
        });
        for (const contract of expiring) {
          const alertType = `${days}_DAYS`;
          const [alert, created] = await ContractAlertModel.findOrCreate({
            where: { companyId, contractId: contract.id, alertType },
            defaults: {
              companyId,
              contractId: contract.id,
              alertType,
              scheduledAt: new Date(`${asOfDate}T00:00:00.000Z`),
              sentAt: null,
            },
            transaction,
          });
          if (!created) continue;
          generated += 1;
          await ContractOutboxModel.create(
            {
              companyId,
              aggregateId: contract.id,
              eventType: 'contracts.expiring_soon',
              payload: {
                contractId: contract.id,
                employeeId: contract.employeeId,
                contractNumber: contract.contractNumber,
                endDate: targetDate,
                daysRemaining: days,
                alertId: alert.id,
              },
              occurredAt: new Date(),
              publishedAt: null,
            },
            { transaction },
          );
        }
      }
      return generated;
    });
  }

  async expireEndedContracts(companyId: number, asOfDate: string): Promise<number> {
    return withTenant(companyId, async (transaction) => {
      const ended = await EmploymentContractModel.findAll({
        where: {
          companyId,
          status: { [Op.in]: ['ACTIVE', 'SUSPENDED'] },
          endDate: { [Op.lt]: asOfDate },
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      for (const row of ended) {
        const snapshot = {
          ...mapContract(row),
          status: 'EXPIRED' as const,
          version: row.version + 1,
        };
        const now = new Date();
        await row.update(
          { status: 'EXPIRED', version: snapshot.version, updatedAt: now },
          { transaction },
        );
        await ContractRecordModel.create(
          {
            companyId,
            contractId: row.id,
            type: 'EXPIRED',
            actorUserId: null,
            payload: { snapshot },
            createdAt: now,
          },
          { transaction },
        );
        await ContractOutboxModel.create(
          {
            companyId,
            aggregateId: row.id,
            eventType: 'contracts.expired',
            payload: { contractId: row.id, employeeId: row.employeeId, endDate: row.endDate },
            occurredAt: now,
            publishedAt: null,
          },
          { transaction },
        );
      }
      return ended.length;
    });
  }

  private async lockContract(companyId: number, id: string, transaction: Transaction) {
    const row = await EmploymentContractModel.findOne({
      where: { id, companyId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!row) throw new NotFoundError('Contract');
    return row;
  }

  private assertVersion(row: EmploymentContractModel, expectedVersion: number): void {
    if (row.version !== expectedVersion)
      throw new ConflictError('Contract was changed by another operation.');
  }

  private async record(
    transaction: Transaction,
    companyId: number,
    contractId: string,
    type: string,
    actorUserId: number | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await ContractRecordModel.create(
      { companyId, contractId, type, actorUserId, payload, createdAt: new Date() },
      { transaction },
    );
  }
}
