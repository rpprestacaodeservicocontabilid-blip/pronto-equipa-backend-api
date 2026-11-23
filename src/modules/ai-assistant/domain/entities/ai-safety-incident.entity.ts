import { randomUUID } from 'crypto';
import { AiValidationError } from '../errors/ai-domain.error';

export const AI_SAFETY_INCIDENT_CATEGORIES = [
  'PROMPT_INJECTION',
  'DATA_EXFILTRATION_ATTEMPT',
  'UNAUTHORIZED_TOOL_USE',
  'SENSITIVE_DATA_EXPOSURE',
  'HALLUCINATION_REPORTED',
  'COST_ABUSE',
  'POLICY_VIOLATION',
] as const;
export type AiSafetyIncidentCategory = (typeof AI_SAFETY_INCIDENT_CATEGORIES)[number];

export const AI_SAFETY_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type AiSafetySeverity = (typeof AI_SAFETY_SEVERITIES)[number];

export interface CreateAiSafetyIncidentInput {
  tenantId: number | null;
  interactionId?: string | null;
  category: string;
  severity: string;
  summary: string;
  details?: Record<string, unknown>;
  detectedBy: string;
  id?: string;
  now?: Date;
}

/**
 * Incidente de segurança detetado pelo assistente (RF-AI-076,
 * RN-AI-024).
 *
 * RN-AI-023: os detalhes nunca incluem segredos ou credenciais — o
 * registo é sanitizado antes de persistir.
 */
export class AiSafetyIncident {
  readonly id: string;
  readonly tenantId: number | null;
  readonly interactionId: string | null;
  readonly category: AiSafetyIncidentCategory;
  readonly severity: AiSafetySeverity;
  readonly summary: string;
  readonly details: Record<string, unknown>;
  readonly detectedBy: string;
  readonly status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(
    input: CreateAiSafetyIncidentInput & {
      category: AiSafetyIncidentCategory;
      severity: AiSafetySeverity;
      summary: string;
      details: Record<string, unknown>;
      status: AiSafetyIncident['status'];
      createdAt: Date;
      updatedAt: Date;
    },
  ) {
    this.id = input.id ?? randomUUID();
    this.tenantId = input.tenantId;
    this.interactionId = input.interactionId ?? null;
    this.category = input.category;
    this.severity = input.severity;
    this.summary = input.summary;
    this.details = input.details;
    this.detectedBy = input.detectedBy;
    this.status = input.status;
    this.createdAt = input.createdAt;
    this.updatedAt = input.updatedAt;
  }

  static create(input: CreateAiSafetyIncidentInput): AiSafetyIncident {
    const category = String(input.category ?? '').trim().toUpperCase();
    if (!AI_SAFETY_INCIDENT_CATEGORIES.includes(category as AiSafetyIncidentCategory))
      throw new AiValidationError(`Categoria de incidente inválida: ${input.category}.`);

    const severity = String(input.severity ?? '').trim().toUpperCase();
    if (!AI_SAFETY_SEVERITIES.includes(severity as AiSafetySeverity))
      throw new AiValidationError(`Severidade inválida: ${input.severity}.`);

    const summary = String(input.summary ?? '').trim();
    if (summary.length < 5 || summary.length > 500)
      throw new AiValidationError('O resumo do incidente deve ter entre 5 e 500 caracteres.');

    const now = input.now ?? new Date();
    return new AiSafetyIncident({
      ...input,
      category: category as AiSafetyIncidentCategory,
      severity: severity as AiSafetySeverity,
      summary,
      details: AiSafetyIncident.sanitize(input.details),
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(
    props: CreateAiSafetyIncidentInput & {
      category: AiSafetyIncidentCategory;
      severity: AiSafetySeverity;
      status: AiSafetyIncident['status'];
      createdAt?: Date;
      updatedAt?: Date;
    },
  ): AiSafetyIncident {
    const now = props.createdAt ?? new Date();
    return new AiSafetyIncident({
      ...props,
      summary: props.summary,
      details: AiSafetyIncident.sanitize(props.details),
      createdAt: now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  /** Remove segredos e credenciais antes de persistir (RN-AI-023). */
  private static sanitize(details?: Record<string, unknown>): Record<string, unknown> {
    const sensitive = /^(password|passwd|secret|token|apikey|api_key|authorization|credential)/i;
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(details ?? {})) {
      output[key] = sensitive.test(key) ? '[REDACTED]' : value;
    }
    return output;
  }
}
