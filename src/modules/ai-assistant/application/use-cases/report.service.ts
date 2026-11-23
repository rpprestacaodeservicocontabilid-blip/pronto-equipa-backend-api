import type { AiConversationRepository } from '../../domain/repositories/ai-conversation.repository';
import type { AiInteractionRepository } from '../../domain/repositories/ai-interaction.repository';
import type { AiToolRepository } from '../../domain/repositories/ai-tool.repository';
import type { AiDashboardView } from '../dto/ai-admin.dto';
import { AiActorContext, AiContextService } from './context.service';
import { AiSafetyService } from './safety.service';
import { AiUsageService } from './usage.service';

const RECENT_SAMPLE = 200;
const FALLBACK_SAMPLE = 50;
const FALLBACK_MODEL_MARKERS = ['fallback', 'mock', 'local'];

const currentPeriod = (now = new Date()): string =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

/**
 * Casos de uso de relatórios e métricas do assistente (RF-AI-077 a
 * RF-AI-079, secção 22.4).
 *
 * Os indicadores são derivados dos registos do próprio módulo — o
 * assistente nunca lê tabelas de outros contextos para compor o
 * painel.
 */
export class AiReportService {
  constructor(
    private readonly conversations: AiConversationRepository,
    private readonly interactions: AiInteractionRepository,
    private readonly tools: AiToolRepository,
    private readonly usageService: AiUsageService,
    private readonly safetyService: AiSafetyService,
    private readonly contextService: AiContextService,
  ) {}

  async dashboard(actor: AiActorContext, period = currentPeriod()): Promise<AiDashboardView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:reports:read');

    const tenantId = actor.tenantId;
    const [usage, cost, recent, conversationPage] = await Promise.all([
      this.usageService.summary(tenantId, period),
      this.usageService.costs(tenantId, period),
      this.interactions.listInteractions(tenantId, {
        userId: actor.actorId,
        page: 1,
        limit: RECENT_SAMPLE,
      }),
      this.conversations.listConversations(tenantId, actor.actorId, {
        page: 1,
        limit: 1,
      }),
    ]);

    const completed = recent.data.filter((interaction) => interaction.completedAt !== null);
    const totalLatency = completed.reduce((sum, interaction) => {
      const completedAt = interaction.completedAt;
      if (!completedAt) return sum;
      return sum + (completedAt.getTime() - interaction.startedAt.getTime());
    }, 0);
    const failed = recent.data.filter(
      (interaction) => interaction.status === 'FAILED' || interaction.status === 'BLOCKED',
    );
    const cited = recent.data.filter((interaction) => interaction.citationCount > 0);
    const quotaExceeded = recent.data.filter((interaction) =>
      String(interaction.failureReason ?? '')
        .toLowerCase()
        .includes('quota'),
    );

    const [executions, denied, proposed, confirmed, safetyIncidents, fallbackRate] =
      await Promise.all([
        this.tools.listToolExecutions(tenantId, { page: 1, limit: 1 }),
        this.tools.listToolExecutions(tenantId, { status: 'DENIED', page: 1, limit: 1 }),
        this.tools.listActionProposals(tenantId, { status: 'PROPOSED', page: 1, limit: 1 }),
        this.tools.listActionProposals(tenantId, { status: 'CONFIRMED', page: 1, limit: 1 }),
        this.safetyService.countIncidents(tenantId),
        this.fallbackRate(tenantId),
      ]);

    return {
      activeConversations: conversationPage.total,
      messagesProcessed: usage.requests,
      averageResponseMs: completed.length ? Math.round(totalLatency / completed.length) : 0,
      errorRate: recent.data.length
        ? Math.round((failed.length / recent.data.length) * 1000) / 10
        : 0,
      totalTokens: usage.totalTokens,
      cost: {
        period: cost.period,
        amount: cost.amount,
        currency: cost.currency,
        estimatedAmount: cost.estimatedAmount,
        confirmedAmount: cost.confirmedAmount,
        byProvider: cost.byProvider,
        byModel: cost.byModel,
      },
      toolsExecuted: executions.total,
      actionsDenied: denied.total,
      pendingApprovals: proposed.total + confirmed.total,
      safetyIncidents,
      sourceCitationRate: recent.data.length
        ? Math.round((cited.length / recent.data.length) * 1000) / 10
        : 0,
      quotaExceededCount: quotaExceeded.length,
      fallbackRate,
    };
  }

  /** Percentagem de invocações que recorreram a um modelo de recurso. */
  private async fallbackRate(tenantId: number): Promise<number> {
    const recent = await this.interactions.listInteractions(tenantId, {
      page: 1,
      limit: FALLBACK_SAMPLE,
    });
    if (!recent.data.length) return 0;

    let sampled = 0;
    let fallback = 0;
    for (const interaction of recent.data.slice(0, FALLBACK_SAMPLE)) {
      const invocations = await this.interactions.listModelInvocations(tenantId, interaction.id);
      for (const invocation of invocations) {
        sampled += 1;
        const model = String(invocation.modelId).toLowerCase();
        if (invocation.fallbackUsed || FALLBACK_MODEL_MARKERS.some((marker) => model.includes(marker)))
          fallback += 1;
      }
    }

    return sampled ? Math.round((fallback / sampled) * 1000) / 10 : 0;
  }
}
