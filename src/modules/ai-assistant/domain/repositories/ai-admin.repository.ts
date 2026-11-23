import { AiPromptVersion } from '../entities/ai-prompt-version.entity';
import { AiSafetyIncident } from '../entities/ai-safety-incident.entity';

export interface AiModelProviderRecord {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  baseUrl: string | null;
  apiKeyEnv: string | null;
  timeoutMs: number;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiModelConfigurationRecord {
  id: string;
  providerId: string;
  modelCode: string;
  displayName: string;
  status: 'ACTIVE' | 'DISABLED' | 'FALLBACK';
  isDefault: boolean;
  temperature: number | null;
  maxOutputTokens: number | null;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  currency: string;
  capabilities: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AiSafetyPolicyRecord {
  id: string;
  scopeKey: string;
  version: number;
  status: 'ACTIVE' | 'ARCHIVED';
  configuration: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiEvaluationRecord {
  id: string;
  code: string;
  version: number;
  status: 'ACTIVE' | 'ARCHIVED';
  cases: Array<{ id: string; name: string; expectedBehaviour: string }>;
  lastRunAt: Date | null;
  lastScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Contrato de administração do assistente (RF-AI-051 a RF-AI-059,
 * RF-AI-074 a RF-AI-080).
 */
export interface AiAdminRepository {
  listModelProviders(): Promise<AiModelProviderRecord[]>;
  saveModelProvider(provider: Omit<AiModelProviderRecord, 'createdAt' | 'updatedAt'>): Promise<AiModelProviderRecord>;
  findModelProvider(id: string): Promise<AiModelProviderRecord | null>;

  listModelConfigurations(filter?: { providerId?: string; status?: string }): Promise<AiModelConfigurationRecord[]>;
  findModelConfiguration(id: string): Promise<AiModelConfigurationRecord | null>;
  saveModelConfiguration(
    configuration: Omit<AiModelConfigurationRecord, 'createdAt' | 'updatedAt'>,
  ): Promise<AiModelConfigurationRecord>;
  clearDefaultModel(providerId: string): Promise<void>;

  listPromptVersions(filter: { templateCode?: string; status?: string; limit: number }): Promise<AiPromptVersion[]>;
  savePromptVersion(version: AiPromptVersion): Promise<AiPromptVersion>;
  findPublishedPrompt(templateCode: string): Promise<AiPromptVersion | null>;

  saveSafetyPolicy(policy: AiSafetyPolicyRecord): Promise<AiSafetyPolicyRecord>;
  findActiveSafetyPolicy(scopeKey: string): Promise<AiSafetyPolicyRecord | null>;

  saveSafetyIncident(incident: AiSafetyIncident): Promise<AiSafetyIncident>;
  listSafetyIncidents(filter: {
    tenantId: number | null;
    status?: string;
    severity?: string;
    limit: number;
  }): Promise<AiSafetyIncident[]>;
  countSafetyIncidents(filter: { tenantId: number | null }): Promise<number>;

  saveEvaluation(evaluation: AiEvaluationRecord): Promise<AiEvaluationRecord>;
  listEvaluations(limit: number): Promise<AiEvaluationRecord[]>;
}
