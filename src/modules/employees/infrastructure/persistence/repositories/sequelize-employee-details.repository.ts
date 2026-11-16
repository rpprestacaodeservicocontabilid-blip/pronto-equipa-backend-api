import { randomUUID } from 'crypto';
import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../../../../../infra/database';
import { ValidationError } from '../../../../../shared/errors/app.error';
import {
  EmployeeBankAccountInput,
  EmployeeDependentInput,
  EmployeeDependentView,
  EmployeeDetailsRepository,
} from '../../../application/ports/employee-details.repository';
import { EmployeeBankAccountModel } from '../models/employee-bank-account.model';
import { EmployeeDependentModel } from '../models/employee-dependent.model';
import { EmployeeModel } from '../models/employee.model';

const inTenantTransaction = async <T>(
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

export class SequelizeEmployeeDetailsRepository implements EmployeeDetailsRepository {
  async listDependents(
    companyId: number,
    employeeId: string,
  ): Promise<EmployeeDependentView[] | null> {
    return inTenantTransaction(companyId, async (transaction) => {
      const employee = await EmployeeModel.findOne({
        where: { id: employeeId, companyId },
        attributes: ['id'],
        transaction,
      });
      if (!employee) return null;

      const dependents = await EmployeeDependentModel.findAll({
        where: { companyId, employeeId },
        order: [['fullName', 'ASC']],
        transaction,
      });
      return dependents.map((dependent) => ({
        id: dependent.id,
        companyId,
        employeeId,
        fullName: dependent.fullName,
        relationship: dependent.relationship,
        dateOfBirth: dependent.dateOfBirth,
        fiscalDependent: dependent.fiscalDependent,
        createdAt: dependent.createdAt,
      }));
    });
  }

  async addDependent(input: EmployeeDependentInput): Promise<EmployeeDependentView | null> {
    return inTenantTransaction(input.companyId, async (transaction) => {
      const employee = await EmployeeModel.findOne({
        where: { id: input.employeeId, companyId: input.companyId },
        attributes: ['id'],
        transaction,
      });
      if (!employee) return null;

      const now = new Date();
      const dependent = await EmployeeDependentModel.create(
        {
          id: randomUUID(),
          companyId: input.companyId,
          employeeId: input.employeeId,
          fullName: input.fullName.trim(),
          relationship: input.relationship.trim(),
          dateOfBirth: input.dateOfBirth,
          fiscalDependent: input.fiscalDependent,
          createdAt: now,
          updatedAt: now,
        },
        { transaction },
      );

      return {
        id: dependent.id,
        companyId: dependent.companyId,
        employeeId: dependent.employeeId,
        fullName: dependent.fullName,
        relationship: dependent.relationship,
        dateOfBirth: dependent.dateOfBirth,
        fiscalDependent: dependent.fiscalDependent,
        createdAt: dependent.createdAt,
      };
    });
  }

  async getBankAccount(
    companyId: number,
    employeeId: string,
  ): Promise<Omit<EmployeeBankAccountInput, 'companyId' | 'employeeId'> | null> {
    return inTenantTransaction(companyId, async (transaction) => {
      const row = await EmployeeBankAccountModel.findOne({
        where: { companyId, employeeId },
        transaction,
      });
      if (!row) return null;
      return {
        bankName: row.bankName,
        accountName: row.accountName,
        accountNumber: row.accountNumber,
        iban: row.iban,
        currency: row.currency,
      };
    });
  }

  async setBankAccount(input: EmployeeBankAccountInput): Promise<boolean> {
    return inTenantTransaction(input.companyId, async (transaction) => {
      const employee = await EmployeeModel.findOne({
        where: { id: input.employeeId, companyId: input.companyId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!employee) return false;
      if (employee.status === 'TERMINATED') {
        throw new ValidationError('Bank details cannot be changed for a terminated employee.');
      }

      const now = new Date();
      const [row, created] = await EmployeeBankAccountModel.findOrCreate({
        where: { companyId: input.companyId, employeeId: input.employeeId },
        defaults: {
          id: randomUUID(),
          ...input,
          createdAt: now,
          updatedAt: now,
        },
        transaction,
      });
      if (!created) {
        row.set({
          bankName: input.bankName,
          accountName: input.accountName,
          accountNumber: input.accountNumber,
          iban: input.iban,
          currency: input.currency,
          updatedAt: now,
        });
        await row.save({ transaction });
      }
      return true;
    });
  }
}
