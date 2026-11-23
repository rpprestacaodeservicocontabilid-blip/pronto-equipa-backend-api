import type { AiActionApproval } from '../../domain/aggregates/ai-action-approval.aggregate';
import type { AiConversation } from '../../domain/aggregates/ai-conversation.aggregate';
import type { AiInteraction } from '../../domain/aggregates/ai-interaction.aggregate';
import type { AiKnowledgeSource } from '../../domain/aggregates/ai-knowledge-source.aggregate';
import type { AiToolDefinition } from '../../domain/aggregates/ai-tool-definition.aggregate';
import type { AiToolExecution } from '../../domain/aggregates/ai-tool-execution.aggregate';
import type { AiIndexingJob } from '../../domain/entities/ai-indexing-job.entity';
import type { AiMessage } from '../../domain/entities/ai-message.entity';
import type { AiMessageCitation } from '../../domain/entities/ai-message-citation.entity';
import type { AiSafetyIncident } from '../../domain/entities/ai-safety-incident.entity';
import type {
  AiModelConfigurationRecord,
  AiModelProviderRecord,
} from '../../domain/repositories/ai-admin.repository';
import type {
  AiConversationView,
  AiMessageView,
} from '../dto/ai-conversation.dto';
import type {
  AiActionProposalView,
  AiInteractionView,
  AiToolExecutionView,
  AiToolView,
} from '../dto/ai-interaction.dto';
import type {
  AiIndexingJobView,
  AiKnowledgeSourceView,
  AiPromptView,
  AiProviderView,
  AiModelView,
  AiSafetyIncidentView,
} from '../dto/ai-admin.dto';
import type { AiPromptVersion } from '../../domain/entities/ai-prompt-version.entity';

/** Mapeadores de domínio para as vistas expostas pela API. */

export const toConversationView = (conversation: AiConversation): AiConversationView => ({
  id: conversation.id,
  title: conversation.title,
  status: conversation.status,
  messageCount: conversation.messageCount,
  lastMessageAt: conversation.lastMessageAt ? conversation.lastMessageAt.toISOString() : null,
  createdAt: conversation.createdAt.toISOString(),
  updatedAt: conversation.updatedAt.toISOString(),
});

export const toMessageView = (
  message: AiMessage,
  citations: readonly AiMessageCitation[] = [],
): AiMessageView => ({
  id: message.id,
  role: message.role,
  content: message.storedContent || message.content,
  createdAt: message.createdAt.toISOString(),
  citations: citations.map((citation) => ({
    sourceId: citation.sourceId,
    title: citation.title,
    reference: citation.reference,
  })),
  interactionId: message.interactionId,
});

export const toInteractionView = (interaction: AiInteraction): AiInteractionView => ({
  id: interaction.id,
  conversationId: interaction.conversationId,
  status: interaction.status,
  createdAt: interaction.createdAt.toISOString(),
  completedAt: interaction.completedAt ? interaction.completedAt.toISOString() : null,
  modelId: interaction.modelId,
  providerId: interaction.providerId,
  inputTokens: interaction.inputTokens,
  outputTokens: interaction.outputTokens,
  toolCallCount: interaction.toolCallCount,
  citationCount: interaction.citationCount,
  failureReason: interaction.failureReason,
});

export const toToolView = (
  tool: AiToolDefinition,
  grantedPermissions: readonly string[],
  profileAllows: readonly string[],
): AiToolView => ({
  name: tool.name,
  version: tool.version,
  module: tool.module,
  description: tool.description,
  riskLevel: tool.risk.value,
  requiredPermissions: [...tool.requiredPermissions],
  requiresConfirmation: tool.requiresConfirmation,
  requiresApproval: tool.requiresApproval,
  isActive: tool.isActive,
  available: tool.isAvailableFor(grantedPermissions) && profileAllows.includes(tool.name),
});

export const toExecutionView = (execution: AiToolExecution): AiToolExecutionView => ({
  id: execution.id,
  toolName: execution.toolName,
  toolVersion: execution.toolVersion,
  status: execution.status,
  interactionId: execution.interactionId,
  failureReason: execution.failureReason,
  startedAt: execution.startedAt.toISOString(),
  finishedAt: execution.finishedAt ? execution.finishedAt.toISOString() : null,
});

export const toProposalView = (proposal: AiActionApproval): AiActionProposalView => ({
  id: proposal.id,
  interactionId: proposal.interactionId,
  toolName: proposal.toolName,
  toolVersion: proposal.toolVersion,
  riskLevel: proposal.riskLevel,
  status: proposal.status,
  arguments: proposal.argumentsJson,
  actionHash: proposal.actionHash,
  requiresConfirmation: proposal.requiresConfirmation,
  requiresApproval: proposal.requiresApproval,
  proposedBy: proposal.proposedBy,
  confirmedBy: proposal.confirmedBy,
  approvedBy: proposal.approvedBy,
  rejectedBy: proposal.rejectedBy,
  decisionReason: proposal.decisionReason,
  expiresAt: proposal.expiresAt.toISOString(),
  createdAt: proposal.createdAt.toISOString(),
});

export const toIncidentView = (incident: AiSafetyIncident): AiSafetyIncidentView => ({
  id: incident.id,
  category: incident.category,
  severity: incident.severity,
  summary: incident.summary,
  status: incident.status,
  interactionId: incident.interactionId,
  createdAt: incident.createdAt.toISOString(),
});

export const toSourceView = (source: AiKnowledgeSource): AiKnowledgeSourceView => ({
  id: source.id,
  name: source.name,
  scope: source.scope,
  sourceType: source.sourceType,
  classification: source.classification,
  status: source.status,
  documentCount: source.documentCount,
  chunkCount: source.chunkCount,
  lastIndexedAt: source.lastIndexedAt ? source.lastIndexedAt.toISOString() : null,
  lastError: source.lastError,
});

export const toJobView = (job: AiIndexingJob): AiIndexingJobView => ({
  id: job.id,
  sourceId: job.sourceId,
  kind: job.kind,
  status: job.status,
  attempts: job.attempts,
  lastError: job.lastError,
  createdAt: job.createdAt.toISOString(),
});

export const toPromptView = (prompt: AiPromptVersion): AiPromptView => ({
  id: prompt.id,
  templateCode: prompt.templateCode,
  version: prompt.version,
  status: prompt.status,
  content: prompt.content,
  modelHints: [...prompt.modelHints],
  publishedAt: prompt.publishedAt ? prompt.publishedAt.toISOString() : null,
  createdAt: prompt.createdAt.toISOString(),
});

export const toProviderView = (provider: AiModelProviderRecord): AiProviderView => ({
  id: provider.id,
  code: provider.code,
  name: provider.name,
  status: provider.status,
  timeoutMs: provider.timeoutMs,
  priority: provider.priority,
  baseUrl: provider.baseUrl,
});

export const toModelView = (model: AiModelConfigurationRecord): AiModelView => ({
  id: model.id,
  providerId: model.providerId,
  modelCode: model.modelCode,
  displayName: model.displayName,
  status: model.status,
  isDefault: model.isDefault,
  temperature: model.temperature,
  maxOutputTokens: model.maxOutputTokens,
  currency: model.currency,
  inputPricePerMillion: model.inputPricePerMillion,
  outputPricePerMillion: model.outputPricePerMillion,
  capabilities: [...model.capabilities],
});

export const chunkSnippet = (content: string, length = 400): string => {
  const text = String(content ?? '');
  return text.length <= length ? text : `${text.slice(0, length)}…`;
};
