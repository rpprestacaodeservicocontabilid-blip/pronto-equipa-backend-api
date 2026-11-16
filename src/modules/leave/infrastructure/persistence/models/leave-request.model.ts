import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';

export interface LeaveRequestAttributes {
  id: string;
  companyId: number;
  employeeId: string;
  accountId: string;
  leaveType: string;
  status: string;
  reason: string | null;
  requestedDays: number;
  startDate: string;
  endDate: string;
  submittedAt: Date | null;
  decidedAt: Date | null;
  createdByUserId: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `leave_requests` — pedido de férias e o seu ciclo de vida
 * (secção 5). `version` suporta bloqueio optimista nas operações
 * críticas (RNF-004).
 */
export class LeaveRequestModel
  extends Model<
    LeaveRequestAttributes,
    Optional<
      LeaveRequestAttributes,
      'reason' | 'submittedAt' | 'decidedAt' | 'version' | 'createdAt' | 'updatedAt'
    >
  >
  implements LeaveRequestAttributes
{
  declare id: string;
  declare companyId: number;
  declare employeeId: string;
  declare accountId: string;
  declare leaveType: string;
  declare status: string;
  declare reason: string | null;
  declare requestedDays: number;
  declare startDate: string;
  declare endDate: string;
  declare submittedAt: Date | null;
  declare decidedAt: Date | null;
  declare createdByUserId: number;
  declare version: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

LeaveRequestModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'companies', key: 'id' },
    },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    accountId: { type: DataTypes.UUID, allowNull: false },
    leaveType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'ANNUAL' },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'DRAFT' },
    reason: { type: DataTypes.STRING(1000), allowNull: true },
    requestedDays: { type: DataTypes.INTEGER, allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: true },
    createdByUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'leave_requests',
    indexes: [
      { fields: ['companyId', 'employeeId', 'startDate'], name: 'idx_leave_request_employee' },
      { fields: ['companyId', 'status'], name: 'idx_leave_request_status' },
      { fields: ['companyId', 'startDate', 'endDate'], name: 'idx_leave_request_period' },
      { fields: ['companyId', 'id'], unique: true, name: 'uq_leave_request_company_id' },
    ],
  },
);
