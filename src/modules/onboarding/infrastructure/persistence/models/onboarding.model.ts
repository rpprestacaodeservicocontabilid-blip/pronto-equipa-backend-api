import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';
export class OnboardingApplication extends Model {
  declare id: string;
  declare ownerId: number;
  declare operationKey: string;
  declare status: string;
  declare companyId: number | null;
  declare version: number;
  declare data: Record<string, any>;
}
OnboardingApplication.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    ownerId: { type: DataTypes.INTEGER, allowNull: false },
    operationKey: { type: DataTypes.STRING(160), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false },
    companyId: { type: DataTypes.INTEGER, allowNull: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    data: { type: DataTypes.JSON, allowNull: false },
  },
  {
    sequelize,
    tableName: 'onboarding_applications',
    indexes: [{ unique: true, fields: ['ownerId', 'operationKey'] }],
  },
);
export class OnboardingEvent extends Model {
  declare id: string;
  declare applicationId: string;
  declare data: Record<string, any>;
}
OnboardingEvent.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    applicationId: { type: DataTypes.UUID, allowNull: false },
    data: { type: DataTypes.JSON, allowNull: false },
  },
  { sequelize, tableName: 'onboarding_events', updatedAt: false },
);
export class OnboardingResource extends Model {
  declare id: string;
  declare applicationId: string;
  declare kind: string;
  declare key: string;
  declare status: string;
  declare data: Record<string, any>;
}
OnboardingResource.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    applicationId: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.STRING(40), allowNull: false },
    key: { type: DataTypes.STRING(240), allowNull: false },
    status: { type: DataTypes.STRING(40), allowNull: false },
    data: { type: DataTypes.JSON, allowNull: false },
  },
  {
    sequelize,
    tableName: 'onboarding_resources',
    indexes: [{ unique: true, fields: ['applicationId', 'kind', 'key'] }],
  },
);

export class OnboardingPolicy extends Model {}
OnboardingPolicy.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    version: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    actorId: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    data: { type: DataTypes.JSON, allowNull: false },
  },
  { sequelize, tableName: 'onboarding_policies', updatedAt: false },
);

