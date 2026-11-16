import { DataTypes, Model, ModelStatic } from 'sequelize';
import { sequelize } from '../../../../../infra/database/index';
export class SubscriptionRecordModel extends Model {
  declare id: string;
  declare companyId: number | null;
  declare status: string;
  declare runId: string | null;
  declare employeeId: string | null;
  declare key: string;
  declare version: number;
  declare data: Record<string, any>;
  declare createdAt: Date;
  declare updatedAt: Date;
}
const define = (
  tableName: string,
  tenantScoped = true,
  uniqueKey = true,
): ModelStatic<SubscriptionRecordModel> => {
  class Row extends SubscriptionRecordModel {}
  Row.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      companyId: { type: DataTypes.INTEGER, allowNull: !tenantScoped },
      status: { type: DataTypes.STRING(40), allowNull: false },
      runId: { type: DataTypes.UUID, allowNull: true },
      employeeId: { type: DataTypes.UUID, allowNull: true },
      key: { type: DataTypes.STRING(240), allowNull: false },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      data: { type: DataTypes.JSON, allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName,
      modelName: tableName,
      indexes: [
        ...(uniqueKey
          ? [{ unique: true, fields: tenantScoped ? ['companyId', 'key'] : ['key'] }]
          : []),
        { fields: ['companyId', 'runId', 'status'] },
      ],
    },
  );
  return Row;
};
export const SubscriptionPlanModel = define('subscription_plans', false);
export const SubscriptionPlanVersionModel = define('subscription_plan_versions', false);
export const SubscriptionPlanPriceModel = define('subscription_plan_prices', false);
export const SubscriptionFeatureModel = define('subscription_features', false);
export const SubscriptionPlanFeatureModel = define('subscription_plan_features', false);
export const SubscriptionPlanLimitModel = define('subscription_plan_limits', false);
export const TenantSubscriptionModel = define('tenant_subscriptions');
export const SubscriptionPeriodModel = define('subscription_periods');
export const SubscriptionTrialModel = define('subscription_trials');
export const SubscriptionEntitlementModel = define('subscription_entitlements');
export const SubscriptionOverrideModel = define('subscription_overrides');
export const SubscriptionChangeRequestModel = define('subscription_change_requests');
export const SubscriptionUsageAccountModel = define('subscription_usage_accounts');
export const SubscriptionUsageReservationModel = define('subscription_usage_reservations');
export const SubscriptionUsageRecordModel = define('subscription_usage_records');
export const SubscriptionTransitionModel = define('subscription_transitions', true, false);
export const SubscriptionApprovalModel = define('subscription_approvals', true, false);
export const SubscriptionNotificationModel = define('subscription_notifications', true, false);
export const SubscriptionPolicyModel = define('subscription_policies', false);
export const SubscriptionOutboxModel = define('subscription_outbox', false, false);
