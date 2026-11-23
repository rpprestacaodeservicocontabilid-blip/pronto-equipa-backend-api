import { AI_EVENTS } from '../../domain/events/ai-domain.event';
import { AiSafetyIncident } from '../../domain/entities/ai-safety-incident.entity';
import type { AiSafetyClassification } from '../../domain/value-objects/ai-safety-classification.vo';
import type { AiAdminRepository } from '../../domain/repositories/ai-admin.repository';
import { AiSafetyPolicyService } from '../../domain/services/ai-safety-policy.service';
import type { AiAuditPort } from '../ports/ai-audit.port';
import type { EventPublisherPort } from '../ports/event-publisher.port';
import type { AiSafetyIncidentView } from '../dto/ai-admin.dto';
import { AiActorContext, AiContextService } from './context.service';
import { toIncidentView } from './ai-views';

export interface AiSafetyEvaluationResult {
  classification: AiSafetyClassification;
  score: number;
  blocked: boolean;
}

/**
 * Casos de uso de segurança do assistente (RF-AI-071 a RF-AI-073,
 * RF-AI-076, RN-AI-021/022/023/024).
 *
 * A política é pura (domínio); este serviço responsável por aplicá-la
 * no fluxo e por registar incidentes sanitizados.
 */
export class AiSafetyService {
  private readonly policy = new AiSafetyPolicyService();

  constructor(
    private readonly admin: AiAdminRepository,
    private readonly contextService: AiContextService,
    private readonly audit: AiAuditPort,
    private readonly events: EventPublisherPort,
  ) {}

  evaluateInput(content: string): AiSafetyEvaluationResult {
    const result = this.policy.evaluateInput(content);
    return { ...result, blocked: result.classification.isBlocked };
  }

  evaluateRetrieved(content: string): AiSafetyEvaluationResult {
    const result = this.policy.evaluateRetrieved(content);
    return { ...result, blocked: result.classification.isBlocked };
  }

  evaluateOutput(answer: string): AiSafetyEvaluationResult {
    const result = this.policy.evaluateOutput(answer);
    return { ...result, blocked: result.classification.isBlocked };
  }

  redactSecrets(text: string): string {
    return this.policy.redactSecrets(text);
  }

  wrapRetrieved(content: string): string {
    return this.policy.wrapRetrieved(content);
  }

  untrustedContentInstruction(): string {
    return this.policy.untrustedContentInstruction();
  }

  /** Regista um incidente de segurança (RF-AI-076) já sanitizado. */
  async recordIncident(input: {
    tenantId: number | null;
    interactionId?: string | null;
    category: string;
    severity: string;
    summary: string;
    details?: Record<string, unknown>;
    detectedBy: string;
    actorId?: number | null;
  }): Promise<AiSafetyIncident> {
    const incident = AiSafetyIncident.create({
      tenantId: input.tenantId,
      interactionId: input.interactionId ?? null,
      category: input.category,
      severity: input.severity,
      summary: input.summary,
      details: input.details,
      detectedBy: input.detectedBy,
    });
    await this.admin.saveSafetyIncident(incident);

    await this.audit.record({
      tenantId: input.tenantId,
      actorId: input.actorId ?? null,
      action: 'ai-safety.incident.recorded',
      entityType: 'ai_safety_incident',
      entityId: incident.id,
      outcome: 'DENIED',
      after: { category: incident.category, severity: incident.severity },
    });

    await this.events.publish({
      eventName: AI_EVENTS.SAFETY_INCIDENT_DETECTED,
      aggregateId: incident.id,
      tenantId: incident.tenantId,
      userId: input.actorId ?? null,
      occurredAt: incident.createdAt,
      payload: {
        incidentId: incident.id,
        category: incident.category,
        severity: incident.severity,
        interactionId: incident.interactionId,
      },
    });

    return incident;
  }

  async listIncidents(
    actor: AiActorContext,
    filter: { status?: string; severity?: string; limit?: number } = {},
  ): Promise<AiSafetyIncidentView[]> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:safety:read');

    const incidents = await this.admin.listSafetyIncidents({
      tenantId: actor.tenantId,
      status: filter.status,
      severity: filter.severity,
      limit: Math.min(200, Math.max(1, Number(filter.limit) || 50)),
    });
    return incidents.map(toIncidentView);
  }

  async countIncidents(tenantId: number): Promise<number> {
    return this.admin.countSafetyIncidents({ tenantId });
  }
}
