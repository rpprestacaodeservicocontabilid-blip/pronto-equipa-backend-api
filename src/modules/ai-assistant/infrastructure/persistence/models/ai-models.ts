import type { Model, SyncOptions } from 'sequelize';
import {
  AiConversationModel,
  AiContextSnapshotModel,
  AiMessageCitationModel,
  AiMessageModel,
} from './ai-conversation.model';
import {
  AiFeedbackModel,
  AiInteractionModel,
  AiModelInvocationModel,
} from './ai-interaction.model';
import {
  AiActionApprovalModel,
  AiToolDefinitionModel,
  AiToolExecutionModel,
} from './ai-tool.model';
import {
  AiIndexingJobModel,
  AiKnowledgeChunkModel,
  AiKnowledgeSourceModel,
} from './ai-knowledge.model';
import {
  AiCostRecordModel,
  AiUsageAccountModel,
  AiUsageRecordModel,
} from './ai-usage.model';
import {
  AiEvaluationModel,
  AiModelConfigurationModel,
  AiModelProviderModel,
  AiPromptVersionModel,
  AiSafetyIncidentModel,
  AiSafetyPolicyModel,
} from './ai-admin.model';
import { AiOutboxModel } from './ai-outbox.model';

/**
 * Contrato mínimo de sincronização usado pelos testes (compatível
 * com `SyncableModel` de `src/tests/support/models`).
 */
export interface AiSyncableModel {
  sync(options?: SyncOptions): Promise<Model>;
}

/**
 * Todos os modelos do módulo `ai-assistant/`.
 *
 * Importar este ficheiro garante que as classes são registadas no
 * Sequelize antes de qualquer consulta (migrações, testes, runtime).
 */
export const AI_ASSISTANT_MODELS: readonly AiSyncableModel[] = [
  AiConversationModel,
  AiMessageModel,
  AiMessageCitationModel,
  AiContextSnapshotModel,
  AiInteractionModel,
  AiModelInvocationModel,
  AiFeedbackModel,
  AiToolDefinitionModel,
  AiToolExecutionModel,
  AiActionApprovalModel,
  AiKnowledgeSourceModel,
  AiKnowledgeChunkModel,
  AiIndexingJobModel,
  AiUsageAccountModel,
  AiUsageRecordModel,
  AiCostRecordModel,
  AiPromptVersionModel,
  AiSafetyIncidentModel,
  AiSafetyPolicyModel,
  AiModelProviderModel,
  AiModelConfigurationModel,
  AiEvaluationModel,
  AiOutboxModel,
];

export {
  AiConversationModel,
  AiContextSnapshotModel,
  AiMessageCitationModel,
  AiMessageModel,
  AiFeedbackModel,
  AiInteractionModel,
  AiModelInvocationModel,
  AiActionApprovalModel,
  AiToolDefinitionModel,
  AiToolExecutionModel,
  AiIndexingJobModel,
  AiKnowledgeChunkModel,
  AiKnowledgeSourceModel,
  AiCostRecordModel,
  AiUsageAccountModel,
  AiUsageRecordModel,
  AiEvaluationModel,
  AiModelConfigurationModel,
  AiModelProviderModel,
  AiPromptVersionModel,
  AiSafetyIncidentModel,
  AiSafetyPolicyModel,
  AiOutboxModel,
};
