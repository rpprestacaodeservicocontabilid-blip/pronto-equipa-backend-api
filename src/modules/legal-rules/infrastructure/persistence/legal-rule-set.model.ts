import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../../infra/database';

export type LegalRuleSetStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'RETIRED';

interface LegalRuleSetAttributes {
  id: string;
  companyId: number | null;
  scopeKey: string;
  ruleSetId: string;
  version: string;
  jurisdiction: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceReference: string;
  evidenceReference: string;
  rules: Record<string, unknown>;
  integrityHash: string | null;
  status: LegalRuleSetStatus;
  createdBy: number;
  submittedBy: number | null;
  submittedAt: Date | null;
  approvedBy: number | null;
  approvedAt: Date | null;
  publishedBy: number | null;
  publishedAt: Date | null;
  retiredBy: number | null;
  retiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class LegalRuleSetModel extends Model<LegalRuleSetAttributes, Optional<LegalRuleSetAttributes,
  'id' | 'scopeKey' | 'effectiveTo' | 'integrityHash' | 'status' | 'submittedBy' | 'submittedAt' | 'approvedBy' | 'approvedAt' | 'publishedBy' | 'publishedAt' | 'retiredBy' | 'retiredAt' | 'createdAt' | 'updatedAt'>>
  implements LegalRuleSetAttributes {
  declare id: string;
  declare companyId: number | null;
  declare scopeKey: string;
  declare ruleSetId: string;
  declare version: string;
  declare jurisdiction: string;
  declare effectiveFrom: string;
  declare effectiveTo: string | null;
  declare sourceReference: string;
  declare evidenceReference: string;
  declare rules: Record<string, unknown>;
  declare integrityHash: string | null;
  declare status: LegalRuleSetStatus;
  declare createdBy: number;
  declare submittedBy: number | null;
  declare submittedAt: Date | null;
  declare approvedBy: number | null;
  declare approvedAt: Date | null;
  declare publishedBy: number | null;
  declare publishedAt: Date | null;
  declare retiredBy: number | null;
  declare retiredAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

LegalRuleSetModel.init({
  id: { type: DataTypes.UUID, primaryKey: true },
  companyId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'companies', key: 'id' }, onDelete: 'RESTRICT' },
  scopeKey: { type: DataTypes.STRING(40), allowNull: false },
  ruleSetId: { type: DataTypes.STRING(100), allowNull: false },
  version: { type: DataTypes.STRING(50), allowNull: false },
  jurisdiction: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'AO' },
  effectiveFrom: { type: DataTypes.DATEONLY, allowNull: false },
  effectiveTo: { type: DataTypes.DATEONLY, allowNull: true },
  sourceReference: { type: DataTypes.STRING(500), allowNull: false },
  evidenceReference: { type: DataTypes.STRING(1000), allowNull: false },
  rules: { type: DataTypes.JSON, allowNull: false },
  integrityHash: { type: DataTypes.STRING(64), allowNull: true },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'DRAFT' },
  createdBy: { type: DataTypes.INTEGER, allowNull: false },
  submittedBy: { type: DataTypes.INTEGER, allowNull: true },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
  approvedBy: { type: DataTypes.INTEGER, allowNull: true },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
  publishedBy: { type: DataTypes.INTEGER, allowNull: true },
  publishedAt: { type: DataTypes.DATE, allowNull: true },
  retiredBy: { type: DataTypes.INTEGER, allowNull: true },
  retiredAt: { type: DataTypes.DATE, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false },
  updatedAt: { type: DataTypes.DATE, allowNull: false },
}, {
  sequelize,
  tableName: 'legal_rule_sets',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['scopeKey', 'ruleSetId', 'version'], name: 'uq_legal_rule_scope_version' },
    { fields: ['jurisdiction', 'status', 'effectiveFrom', 'effectiveTo'], name: 'ix_legal_rule_resolution' },
    { fields: ['companyId', 'status'], name: 'ix_legal_rule_company_status' },
  ],
});
