import { AiActionApproval } from '../aggregates/ai-action-approval.aggregate';
import { AiToolDefinition } from '../aggregates/ai-tool-definition.aggregate';
import { AiToolExecution } from '../aggregates/ai-tool-execution.aggregate';

/**
 * Contrato do catálogo de ferramentas e do fluxo de acções
 * (RF-AI-041 a RF-AI-050).
 *
 * O catálogo é partilhado por âmbito `PLATFORM` (global) — as
 * definições nunca são alteradas pelo modelo.
 */
export interface AiToolRepository {
  saveToolDefinition(tool: AiToolDefinition): Promise<AiToolDefinition>;
  findToolDefinition(name: string, version: string): Promise<AiToolDefinition | null>;
  listToolDefinitions(filter?: { module?: string; status?: string }): Promise<AiToolDefinition[]>;
  findToolDefinitionById(id: string): Promise<AiToolDefinition | null>;

  saveToolExecution(execution: AiToolExecution): Promise<AiToolExecution>;
  findToolExecution(tenantId: number, executionId: string): Promise<AiToolExecution | null>;
  findToolExecutionByIdempotencyKey(
    tenantId: number,
    idempotencyKey: string,
  ): Promise<AiToolExecution | null>;
  listToolExecutions(
    tenantId: number,
    query: { interactionId?: string; status?: string; page: number; limit: number },
  ): Promise<{ data: AiToolExecution[]; total: number; page: number; limit: number; totalPages: number }>;

  saveActionApproval(proposal: AiActionApproval): Promise<AiActionApproval>;
  findActionApproval(tenantId: number, proposalId: string): Promise<AiActionApproval | null>;
  listActionProposals(
    tenantId: number,
    query: { status?: string; userId?: number; page: number; limit: number },
  ): Promise<{ data: AiActionApproval[]; total: number; page: number; limit: number; totalPages: number }>;
}
