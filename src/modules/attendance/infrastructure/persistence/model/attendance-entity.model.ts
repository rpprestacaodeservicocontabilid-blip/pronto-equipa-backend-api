import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../../infra/database';

export const ATTENDANCE_ENTITY_TYPES = [
  'DAY',
  'OCCURRENCE',
  'JUSTIFICATION',
  'DECISION',
  'CORRECTION',
  'PERIOD',
  'SNAPSHOT',
  'POLICY',
  'IMPORT_BATCH',
  'IMPORT_ITEM',
  'DEVICE',
  'RECTIFICATION',
] as const;

export type AttendanceEntityType = (typeof ATTENDANCE_ENTITY_TYPES)[number];

export interface AttendanceEntityAttributes {
  id: string;
  companyId: number;
  type: AttendanceEntityType;
  employeeId: string | null;
  parentId: string | null;
  workDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: string;
  version: number;
  idempotencyKey: string | null;
  uniqueDayKey: string | null;
  data: Record<string, unknown>;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AttendanceEntityModel
  extends Model<
    AttendanceEntityAttributes,
    Optional<
      AttendanceEntityAttributes,
      | 'id'
      | 'employeeId'
      | 'parentId'
      | 'workDate'
      | 'periodStart'
      | 'periodEnd'
      | 'idempotencyKey'
      | 'uniqueDayKey'
      | 'createdBy'
      | 'createdAt'
      | 'updatedAt'
    >
  >
  implements AttendanceEntityAttributes
{
  declare id: string;
  declare companyId: number;
  declare type: AttendanceEntityType;
  declare employeeId: string | null;
  declare parentId: string | null;
  declare workDate: string | null;
  declare periodStart: string | null;
  declare periodEnd: string | null;
  declare status: string;
  declare version: number;
  declare idempotencyKey: string | null;
  declare uniqueDayKey: string | null;
  declare data: Record<string, unknown>;
  declare createdBy: number | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

AttendanceEntityModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    companyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    type: { type: DataTypes.STRING(30), allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: true },
    parentId: { type: DataTypes.UUID, allowNull: true },
    workDate: { type: DataTypes.DATEONLY, allowNull: true },
    periodStart: { type: DataTypes.DATEONLY, allowNull: true },
    periodEnd: { type: DataTypes.DATEONLY, allowNull: true },
    status: { type: DataTypes.STRING(30), allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    idempotencyKey: { type: DataTypes.STRING(200), allowNull: true },
    uniqueDayKey: { type: DataTypes.STRING(200), allowNull: true },
    data: { type: DataTypes.JSON, allowNull: false },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'attendance_entities',
    indexes: [
      {
        fields: ['companyId', 'type', 'employeeId', 'workDate'],
        name: 'idx_att_entity_employee_date',
      },
      { fields: ['companyId', 'type', 'status'], name: 'idx_att_entity_status' },
      {
        unique: true,
        fields: ['companyId', 'type', 'idempotencyKey'],
        name: 'uq_att_entity_idempotency',
      },
      {
        unique: true,
        fields: ['companyId', 'type', 'uniqueDayKey'],
        name: 'uq_attendance_day',
      },
    ],
  },
);
