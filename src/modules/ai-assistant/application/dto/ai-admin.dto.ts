/**
 * DTOs de administração, utilização e custos (RF-AI-061 a RF-AI-080,
 * secção 22).
 */
export interface AiModelView {
  id: string;
  providerId: string;
  modelCode: string;
  displayName: string;
  status: string;
  isDefault: boolean;
  temperature: number | null;
  maxOutputTokens: number | null;
  currency: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  capabilities: string[];
}

export interface AiProviderView {
  id: string;
  code: string;
  name: string;
  status: string;
  timeoutMs: number;
  priority: number;
  baseUrl: string | null;
}

export interface AiPromptView {
  id: string;
  templateCode: string;
  version: number;
  status: string;
  content: string;
  modelHints: string[];
  publishedAt: string | null;
  createdAt: string;
}

export interface AiUsageSummaryView {
  period: string;
  tenantId: number | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requests: number;
  toolExecutions: number;
  quotaTokens: number | null;
  quotaMessages: number | null;
  utilizationPercent: number | null;
  alertThresholdPercent: number;
}

export interface AiCostSummaryView {
  period: string;
  amount: number;
  currency: string;
  estimatedAmount: number;
  confirmedAmount: number;
  byProvider: Array<{ providerId: string; amount: number; currency: string }>;
  byModel: Array<{ modelId: string; amount: number; currency: string }>;
}

export interface AiDashboardView {
  activeConversations: number;
  messagesProcessed: number;
  averageResponseMs: number;
  errorRate: number;
  totalTokens: number;
  cost: AiCostSummaryView;
  toolsExecuted: number;
  actionsDenied: number;
  pendingApprovals: number;
  safetyIncidents: number;
  sourceCitationRate: number;
  quotaExceededCount: number;
  fallbackRate: number;
}

export interface AiSafetyIncidentView {
  id: string;
  category: string;
  severity: string;
  summary: string;
  status: string;
  interactionId: string | null;
  createdAt: string;
}

export interface AiKnowledgeSourceView {
  id: string;
  name: string;
  scope: string;
  sourceType: string;
  classification: string;
  status: string;
  documentCount: number;
  chunkCount: number;
  lastIndexedAt: string | null;
  lastError: string | null;
}

export interface AiKnowledgeSearchView {
  title: string;
  reference: string;
  snippet: string;
  score: number;
  sourceId: string;
  sourceName: string;
}

export interface AiIndexingJobView {
  id: string;
  sourceId: string;
  kind: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}
