import { AI_EVENTS } from '../../domain/events/ai-domain.event';
import { AiNotFoundError, AiValidationError } from '../../domain/errors/ai-domain.error';
import type {
  AiAdminRepository,
  AiEvaluationRecord,
} from '../../domain/repositories/ai-admin.repository';
import type { AiAuditPort } from '../ports/ai-audit.port';
import type { AiModelGatewayPort } from '../ports/ai-model-gateway.port';
import type { EventPublisherPort } from '../ports/event-publisher.port';
import { AiActorContext, AiContextService } from './context.service';
import { AiModelService } from './model.service';
import { AiSafetyService } from './safety.service';

export interface AiEvaluationCaseInput {
  id: string;
  name: string;
  expectedBehaviour: string;
}

/**
 * Casos de uso de avaliações de regressão do assistente
 * (RF-AI-075, secção 23).
 *
 * Cada execução percorre os casos com o modelo activo, aplica a
 * política de segurança à resposta e regista uma pontuação de
 * passagem — permite detectar regressões antes de publicar prompts.
 */
export class AiEvaluationService {
  constructor(
    private readonly admin: AiAdminRepository,
    private readonly gateway: AiModelGatewayPort,
    private readonly models: AiModelService,
    private readonly safety: AiSafetyService,
    private readonly contextService: AiContextService,
    private readonly audit: AiAuditPort,
    private readonly events: EventPublisherPort,
  ) {}

  async list(actor: AiActorContext, limit = 50): Promise<AiEvaluationRecord[]> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:evaluations:read');
    return this.admin.listEvaluations(Math.min(200, Math.max(1, limit)));
  }

  async save(
    actor: AiActorContext,
    input: { id: string; code: string; version: number; cases: AiEvaluationCaseInput[] },
  ): Promise<AiEvaluationRecord> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:evaluations:manage');

    if (!input.cases.length) throw new AiValidationError('A avaliação precisa de casos.');
    for (const item of input.cases) {
      if (!item.name.trim() || !item.expectedBehaviour.trim())
        throw new AiValidationError('Caso de avaliação incompleto.');
    }

    const evaluation = await this.admin.saveEvaluation({
      id: input.id,
      code: input.code,
      version: input.version,
      status: 'ACTIVE',
      cases: input.cases.map((item) => ({
        id: item.id,
        name: item.name.trim().slice(0, 200),
        expectedBehaviour: item.expectedBehaviour.trim().slice(0, 1000),
      })),
      lastRunAt: null,
      lastScore: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: 'ai-evaluation.saved',
      entityType: 'ai_evaluation',
      entityId: evaluation.id,
      after: { code: evaluation.code, version: evaluation.version },
    });

    return evaluation;
  }

  /** Executa a suite e devolve a pontuação (0–100). */
  async run(
    actor: AiActorContext,
    evaluationId: string,
  ): Promise<{
    id: string;
    code: string;
    score: number;
    passed: number;
    total: number;
    results: Array<{ caseId: string; passed: boolean; reason: string }>;
  }> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:evaluations:manage');

    const suites = await this.admin.listEvaluations(200);
    const suite = suites.find((item) => item.id === evaluationId);
    if (!suite) throw new AiNotFoundError('Avaliação inexistente.');

    const model = await this.models.defaultModel();
    const modelId = model?.modelCode ?? 'mock-model';
    const results: Array<{ caseId: string; passed: boolean; reason: string }> = [];

    for (const item of suite.cases) {
      const reason = await this.executeCase(modelId, item);
      results.push({ caseId: item.id, passed: reason === 'OK', reason });
    }

    const passed = results.filter((item) => item.passed).length;
    const score = suite.cases.length ? Math.round((passed / suite.cases.length) * 100) : 0;
    const now = new Date();

    const updated = await this.admin.saveEvaluation({
      ...suite,
      lastRunAt: now,
      lastScore: score,
      updatedAt: now,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: 'ai-evaluation.run',
      entityType: 'ai_evaluation',
      entityId: suite.id,
      after: { score, passed, total: suite.cases.length },
    });

    await this.events.publish({
      eventName: AI_EVENTS.EVALUATION_COMPLETED,
      aggregateId: suite.id,
      tenantId: actor.tenantId,
      userId: actor.actorId,
      occurredAt: now,
      payload: { evaluationId: suite.id, score, passed, total: suite.cases.length },
    });

    return {
      id: updated.id,
      code: updated.code,
      score,
      passed,
      total: suite.cases.length,
      results,
    };
  }

  private async executeCase(
    modelId: string,
    item: { id: string; name: string; expectedBehaviour: string },
  ): Promise<string> {
    try {
      const response = await this.gateway.generate({
        modelId,
        messages: [{ role: 'user', content: `${item.name}\n${item.expectedBehaviour}` }],
        maxOutputTokens: 300,
        temperature: 0,
      });
      const answer = String(response.content ?? '').trim();
      if (answer.length < 20) return 'EMPTY_ANSWER';
      if (this.safety.evaluateOutput(answer).blocked) return 'UNSAFE_OUTPUT';
      return 'OK';
    } catch (error) {
      return error instanceof Error ? error.message.slice(0, 120) : 'PROVIDER_ERROR';
    }
  }
}
