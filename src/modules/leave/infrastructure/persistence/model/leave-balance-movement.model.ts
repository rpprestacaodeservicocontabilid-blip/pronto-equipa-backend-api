import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

export interface LeaveBalanceMovementAttributes {
  id: number;
  companyId: number;
  accountId: string;
  entitlementId: string | null;
  movementType: 'ACCRUAL' | 'ADJUSTMENT' | 'RESERVATION' | 'RELEASE' | 'USAGE';
  days: number;
  referenceId: string | null;
  reason: string | null;
  actorUserId: number | null;
  createdAt: Date;
}

/**
 * `leave_balance_movements` — ledger IMUTÁVEL do saldo
 * (RN-010/011/014).
 *
 * Não tem `updatedAt`: os movimentos consolidados nunca são
 * editados nem apagados. As rectificações acrescentam novos
 * movimentos, preservando o histórico (RN-049).
 */
export class LeaveBalanceMovementModel
  extends Model<
    LeaveBalanceMovementAttributes,
    Optional<
      LeaveBalanceMovementAttributes,
      | 'id'
      | 'entitlementId'
      | 'referenceId'
      | 'reason'
      | 'actorUserId'
      | 'createdAt'
    >
  >
  implements LeaveBalanceMovementAttributes
{
  declare id: number;
  declare companyId: number;
  declare accountId: string;
  declare entitlementId: string | null;
  declare movementType: LeaveBalanceMovementAttributes['movementType'];
  declare days: number;
  declare referenceId: string | null;
  declare reason: string | null;
  declare actorUserId: number | null;
  declare createdAt: Date;
}

LeaveBalanceMovementModel.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
    },
    accountId: { type: DataTypes.UUID, allowNull: false },
    entitlementId: { type: DataTypes.UUID, allowNull: true },
    movementType: { type: DataTypes.STRING(20), allowNull: false },
    days: { type: DataTypes.INTEGER, allowNull: false },
    referenceId: { type: DataTypes.UUID, allowNull: true },
    reason: { type: DataTypes.STRING(500), allowNull: true },
    actorUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'leave_balance_movements',
    timestamps: false,
    indexes: [
      { fields: ['companyId', 'accountId', 'createdAt'], name: 'idx_leave_movement_account' },
      { fields: ['companyId', 'movementType'], name: 'idx_leave_movement_type' },
      { fields: ['companyId', 'referenceId'], name: 'idx_leave_movement_reference' },
    ],
  },
);
