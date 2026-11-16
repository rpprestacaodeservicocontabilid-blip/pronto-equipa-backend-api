import { z } from 'zod';

import { SupportEntitlementPort } from '../../application/ports/support-ports';

const featuresSchema = z.record(z.string(), z.union([z.boolean(), z.string(), z.number()]));
const supportPlanContractSchema = z
  .object({
    status: z.string().optional(),
    features: featuresSchema.optional(),
    planVersion: z
      .object({ code: z.string().optional(), features: featuresSchema.optional() })
      .nullish(),
  })
  .nullish();

export class SubscriptionEntitlementAdapter implements SupportEntitlementPort {
  constructor(private readonly readContract: (companyId: number) => Promise<unknown>) {}

  async getSupportEntitlements(input: { tenantId: string; at: Date }) {
    const contract = supportPlanContractSchema.parse(
      await this.readContract(Number(input.tenantId)),
    );
    if (!contract)
      return {
        supportEnabled: true,
        supportTier: 'DEFAULT',
        allowedChannels: ['PORTAL'],
        slaPolicyCode: 'DEFAULT',
      };
    const features = contract.planVersion?.features || contract.features || {};
    const { support } = features;
    return {
      supportEnabled: support !== false && contract.status !== 'SUSPENDED',
      supportTier: String(
        typeof support === 'string' ? support : contract.planVersion?.code || 'DEFAULT',
      ),
      allowedChannels: ['PORTAL'],
      slaPolicyCode: String(features.supportSlaPolicy || 'DEFAULT'),
    };
  }
}
