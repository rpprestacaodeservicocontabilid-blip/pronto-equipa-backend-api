import { AiActionApproval } from '../../../domain/aggregates/ai-action-approval.aggregate';
import { AiToolDefinition } from '../../../domain/aggregates/ai-tool-definition.aggregate';
import { AiToolExecution } from '../../../domain/aggregates/ai-tool-execution.aggregate';
import type { AiToolRepository } from '../../../domain/repositories/ai-tool.repository';
import {
  AiActionApprovalModel,
  AiToolDefinitionModel,
  AiToolExecutionModel,
} from '../models/ai-tool.model';
import { aiQueryOptions } from '../ai-transaction-context';

type PagedExecutions = Awaited<ReturnType<AiToolRepository['listToolExecutions']>>;
type PagedProposals = Awaited<ReturnType<AiToolRepository['listActionProposals']>>;

type Paged<T> = { data: T[]; total: number; page: number; limit: number; totalPages: number };

const paginate = <T>(total: number, data: T[], page: number, limit: number): Paged<T> => ({
  data,
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / Math.max(1, limit))),
});

const toDefinition = (row: AiToolDefinitionModel): AiToolDefinition =>
  AiToolDefinition.restore({
    id: row.id,
    name: row.name,
    version: row.version,
    module: row.module,
    description: row.description,
    riskLevel: row.riskLevel,
    requiredPermissions: row.requiredPermissions ?? [],
    requiresConfirmation: row.requiresConfirmation,
    requiresApproval: row.requiresApproval,
    inputSchema: row.inputSchema ?? {},
    outputSchema: row.outputSchema ?? {},
    status: row.status as AiToolDefinition['status'],
    disabledReason: row.disabledReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const toExecution = (row: AiToolExecutionModel): AiToolExecution =>
  AiToolExecution.restore({
    id: row.id,
    tenantId: row.companyId,
    interactionId: row.interactionId,
    toolName: row.toolName,
    toolVersion: row.toolVersion,
    status: row.status as AiToolExecution['status'],
    argumentsHash: row.argumentsHash,
    idempotencyKey: row.idempotencyKey,
    resultReference: row.resultReference,
    failureReason: row.failureReason,
    executedBy: row.executedBy,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const toApproval = (row: AiActionApprovalModel): AiActionApproval =>
  AiActionApproval.restore({
    id: row.id,
    tenantId: row.companyId,
    interactionId: row.interactionId,
    conversationId: row.conversationId,
    proposedBy: row.proposedBy,
    toolName: row.toolName,
    toolVersion: row.toolVersion,
    argumentsJson: row.argumentsJson ?? {},
    actionHash: row.actionHash,
    riskLevel: row.riskLevel,
    requiresConfirmation: row.requiresConfirmation,
    requiresApproval: row.requiresApproval,
    status: row.status,
    confirmedBy: row.confirmedBy,
    confirmedAt: row.confirmedAt,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    rejectedBy: row.rejectedBy,
    rejectedAt: row.rejectedAt,
    decisionReason: row.decisionReason,
    expiresAt: row.expiresAt,
    executedAt: row.executedAt,
    executionId: row.executionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

/**
 * Implementação Sequelize do catálogo de ferramentas e do fluxo de
 * acções (RF-AI-041 a RF-AI-050).
 *
 * O catálogo é de âmbito `PLATFORM` (sem `companyId`); execuções e
 * propostas são sempre filtradas pelo tenant.
 */
export class SequelizeAiToolRepository implements AiToolRepository {
  // ------------------------------------------------------------
  // Catálogo
  // ------------------------------------------------------------

  async saveToolDefinition(tool: AiToolDefinition): Promise<AiToolDefinition> {
    const props = tool.propsSnapshot;
    await AiToolDefinitionModel.upsert(
      {
        id: props.id,
        name: props.name,
        version: props.version,
        module: props.module,
        description: props.description,
        riskLevel: props.riskLevel,
        requiredPermissions: props.requiredPermissions,
        requiresConfirmation: props.requiresConfirmation,
        requiresApproval: props.requiresApproval,
        inputSchema: props.inputSchema,
        outputSchema: props.outputSchema,
        status: props.status,
        disabledReason: props.disabledReason,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      aiQueryOptions(),
    );
    return tool;
  }

  async findToolDefinition(name: string, version: string): Promise<AiToolDefinition | null> {
    const row = await AiToolDefinitionModel.findOne({
      where: { name, version },
      ...aiQueryOptions(),
    });
    return row ? toDefinition(row) : null;
  }

  async listToolDefinitions(filter?: {
    module?: string;
    status?: string;
  }): Promise<AiToolDefinition[]> {
    const where: Record<string, unknown> = {};
    if (filter?.module) where.module = filter.module;
    if (filter?.status) where.status = filter.status;

    const rows = await AiToolDefinitionModel.findAll({
      where,
      order: [
        ['module', 'ASC'],
        ['name', 'ASC'],
      ],
      ...aiQueryOptions(),
    });
    return rows.map(toDefinition);
  }

  async findToolDefinitionById(id: string): Promise<AiToolDefinition | null> {
    const row = await AiToolDefinitionModel.findByPk(id, aiQueryOptions());
    return row ? toDefinition(row) : null;
  }

  // ------------------------------------------------------------
  // Execuções
  // ------------------------------------------------------------

  async saveToolExecution(execution: AiToolExecution): Promise<AiToolExecution> {
    const props = execution.propsSnapshot;
    await AiToolExecutionModel.upsert(
      {
        id: props.id,
        companyId: props.tenantId,
        interactionId: props.interactionId,
        toolName: props.toolName,
        toolVersion: props.toolVersion,
        status: props.status,
        argumentsHash: props.argumentsHash,
        idempotencyKey: props.idempotencyKey,
        resultReference: props.resultReference,
        failureReason: props.failureReason,
        executedBy: props.executedBy,
        startedAt: props.startedAt,
        finishedAt: props.finishedAt,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      aiQueryOptions(),
    );
    return execution;
  }

  async findToolExecution(
    tenantId: number,
    executionId: string,
  ): Promise<AiToolExecution | null> {
    const row = await AiToolExecutionModel.findOne({
      where: { id: executionId, companyId: tenantId },
      ...aiQueryOptions(),
    });
    return row ? toExecution(row) : null;
  }

  async findToolExecutionByIdempotencyKey(
    tenantId: number,
    idempotencyKey: string,
  ): Promise<AiToolExecution | null> {
    const row = await AiToolExecutionModel.findOne({
      where: { companyId: tenantId, idempotencyKey },
      ...aiQueryOptions(),
    });
    return row ? toExecution(row) : null;
  }

  async listToolExecutions(
    tenantId: number,
    query: { interactionId?: string; status?: string; page: number; limit: number },
  ): Promise<PagedExecutions> {
    const page = Math.max(1, query.page);
    const limit = Math.min(200, Math.max(1, query.limit));
    const where: Record<string, unknown> = { companyId: tenantId };
    if (query.interactionId) where.interactionId = query.interactionId;
    if (query.status) where.status = query.status;

    const { count, rows } = await AiToolExecutionModel.findAndCountAll({
      where,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      offset: (page - 1) * limit,
      limit,
      ...aiQueryOptions(),
    });

    return paginate(count, rows.map(toExecution), page, limit);
  }

  // ------------------------------------------------------------
  // Propostas de acção
  // ------------------------------------------------------------

  async saveActionApproval(proposal: AiActionApproval): Promise<AiActionApproval> {
    const props = proposal.propsSnapshot;
    await AiActionApprovalModel.upsert(
      {
        id: props.id,
        companyId: props.tenantId,
        interactionId: props.interactionId,
        conversationId: props.conversationId,
        proposedBy: props.proposedBy,
        toolName: props.toolName,
        toolVersion: props.toolVersion,
        argumentsJson: props.argumentsJson,
        actionHash: props.actionHash,
        riskLevel: props.riskLevel,
        requiresConfirmation: props.requiresConfirmation,
        requiresApproval: props.requiresApproval,
        status: props.status,
        confirmedBy: props.confirmedBy,
        confirmedAt: props.confirmedAt,
        approvedBy: props.approvedBy,
        approvedAt: props.approvedAt,
        rejectedBy: props.rejectedBy,
        rejectedAt: props.rejectedAt,
        decisionReason: props.decisionReason,
        expiresAt: props.expiresAt,
        executedAt: props.executedAt,
        executionId: props.executionId,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      aiQueryOptions(),
    );
    return proposal;
  }

  async findActionApproval(
    tenantId: number,
    proposalId: string,
  ): Promise<AiActionApproval | null> {
    const row = await AiActionApprovalModel.findOne({
      where: { id: proposalId, companyId: tenantId },
      ...aiQueryOptions(),
    });
    return row ? toApproval(row) : null;
  }

  async listActionProposals(
    tenantId: number,
    query: { status?: string; userId?: number; page: number; limit: number },
  ): Promise<PagedProposals> {
    const page = Math.max(1, query.page);
    const limit = Math.min(200, Math.max(1, query.limit));
    const where: Record<string, unknown> = { companyId: tenantId };
    if (query.status) where.status = query.status;
    if (query.userId) where.proposedBy = query.userId;

    const { count, rows } = await AiActionApprovalModel.findAndCountAll({
      where,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      offset: (page - 1) * limit,
      limit,
      ...aiQueryOptions(),
    });

    return paginate(count, rows.map(toApproval), page, limit);
  }
}
