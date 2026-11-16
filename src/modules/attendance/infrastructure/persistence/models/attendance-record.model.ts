import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';
import { PunchType } from '../../../domain/value-objects/punch-type.vo';

export interface AttendanceRecordAttributes {
  id: string;
  companyId: number;
  employeeId: string;
  punchType: PunchType;
  occurredAt: Date;
  workDate: string;
  timezone: string;
  source: string;
  externalReference: string | null;
  idempotencyKey: string | null;
  deviceId: string | null;
  correctionOfId: string | null;
  metadata: Record<string, unknown>;
  createdBy: number | null;
  createdAt: Date;
}

export class AttendanceRecordModel
  extends Model<
    AttendanceRecordAttributes,
    Optional<
      AttendanceRecordAttributes,
      | 'id'
      | 'externalReference'
      | 'idempotencyKey'
      | 'deviceId'
      | 'correctionOfId'
      | 'createdBy'
      | 'createdAt'
    >
  >
  implements AttendanceRecordAttributes
{
  declare id: string;
  declare companyId: number;
  declare employeeId: string;
  declare punchType: PunchType;
  declare occurredAt: Date;
  declare workDate: string;
  declare timezone: string;
  declare source: string;
  declare externalReference: string | null;
  declare idempotencyKey: string | null;
  declare deviceId: string | null;
  declare correctionOfId: string | null;
  declare metadata: Record<string, unknown>;
  declare createdBy: number | null;
  declare createdAt: Date;
}

AttendanceRecordModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    punchType: { type: DataTypes.STRING(20), allowNull: false },
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    workDate: { type: DataTypes.DATEONLY, allowNull: false },
    timezone: { type: DataTypes.STRING(80), allowNull: false },
    source: { type: DataTypes.STRING(30), allowNull: false },
    externalReference: { type: DataTypes.STRING(200), allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: true },
    deviceId: { type: DataTypes.STRING(200), allowNull: true },
    correctionOfId: { type: DataTypes.UUID, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: false },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'attendance_records',
    timestamps: false,
    indexes: [
      {
        fields: ['companyId', 'employeeId', 'workDate', 'occurredAt'],
        name: 'idx_att_record_employee_date',
      },
      {
        unique: true,
        fields: ['companyId', 'source', 'idempotencyKey'],
        name: 'uq_att_record_idempotency',
      },
      {
        unique: true,
        fields: ['companyId', 'source', 'externalReference'],
        name: 'uq_att_record_external_ref',
      },
    ],
  },
);
