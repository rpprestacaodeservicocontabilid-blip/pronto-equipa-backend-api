import {
  SubscriptionPersistencePort,
  SubscriptionRecord,
  SubscriptionCollection,
} from '../../../application/ports/subscription-persistence.port';
import { SequelizeRecordCollections } from '../../../../../shared/infrastructure/persistence/sequelize-record-collections';
import { CompanyModel } from '../../../../tenancy/infrastructure/persistence/models/company.model';
import {
  SubscriptionPlanModel,
  SubscriptionPlanVersionModel,
  SubscriptionPlanPriceModel,
  SubscriptionFeatureModel,
  SubscriptionPlanFeatureModel,
  SubscriptionPlanLimitModel,
  TenantSubscriptionModel,
  SubscriptionPeriodModel,
  SubscriptionTrialModel,
  SubscriptionEntitlementModel,
  SubscriptionOverrideModel,
  SubscriptionChangeRequestModel,
  SubscriptionUsageAccountModel,
  SubscriptionUsageReservationModel,
  SubscriptionUsageRecordModel,
  SubscriptionTransitionModel,
  SubscriptionApprovalModel,
  SubscriptionNotificationModel,
  SubscriptionPolicyModel,
  SubscriptionOutboxModel,
} from '../models/subscriptions.models';
export class SequelizeSubscriptionPersistence
  extends SequelizeRecordCollections<SubscriptionRecord, SubscriptionCollection>
  implements SubscriptionPersistencePort
{
  constructor() {
    super(
      {
        subscriptionPlan: SubscriptionPlanModel,
        subscriptionPlanVersion: SubscriptionPlanVersionModel,
        subscriptionPlanPrice: SubscriptionPlanPriceModel,
        subscriptionFeature: SubscriptionFeatureModel,
        subscriptionPlanFeature: SubscriptionPlanFeatureModel,
        subscriptionPlanLimit: SubscriptionPlanLimitModel,
        tenantSubscription: TenantSubscriptionModel,
        subscriptionPeriod: SubscriptionPeriodModel,
        subscriptionTrial: SubscriptionTrialModel,
        subscriptionEntitlement: SubscriptionEntitlementModel,
        subscriptionOverride: SubscriptionOverrideModel,
        subscriptionChangeRequest: SubscriptionChangeRequestModel,
        subscriptionUsageAccount: SubscriptionUsageAccountModel,
        subscriptionUsageReservation: SubscriptionUsageReservationModel,
        subscriptionUsageRecord: SubscriptionUsageRecordModel,
        subscriptionTransition: SubscriptionTransitionModel,
        subscriptionApproval: SubscriptionApprovalModel,
        subscriptionNotification: SubscriptionNotificationModel,
        subscriptionPolicy: SubscriptionPolicyModel,
        subscriptionOutbox: SubscriptionOutboxModel,
      },
      'subscriptions',
    );
  }
  async latestPlanVersion(
    planId: string,
    context: import('../../../../../shared/application/ports/record-store.port').RecordStoreContext,
  ) {
    const versions = await this.collections.subscriptionPlanVersion.findAll({
      where: { companyId: null, runId: planId },
      transaction: context,
    });
    return Math.max(0, ...versions.map((row) => row.version));
  }
  async companyIds() {
    return (await CompanyModel.findAll({ attributes: ['id'] })).map((row) => ({ id: row.id }));
  }
}
