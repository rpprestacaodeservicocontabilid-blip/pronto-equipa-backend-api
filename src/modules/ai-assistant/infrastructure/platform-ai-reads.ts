import { Op, QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../../../infra/database';
import { NotFoundError } from '../../../shared/errors/app.error';
import { CompanyModel } from '../../tenancy/infrastructure/persistence/models/company.model';
import { SequelizeAiUnitOfWork } from './persistence/repositories/sequelize-ai-work-unit';
import { aiQueryOptions } from './persistence/ai-transaction-context';

type ListDefinition = { table: string; fields: string; scope?: 'company' | 'shared'; month?: boolean };
export const platformAiLists = {
  conversations: { table: 'ai_conversations', scope: 'company', fields: 'id status lastMessageAt createdAt' },
  sessions: { table: 'ai_interactions', scope: 'company', fields: 'id conversationId status providerId modelId citationCount createdAt completedAt' },
  providers: { table: 'ai_model_providers', fields: 'id code name status timeoutMs priority' },
  models: { table: 'ai_model_configurations', fields: 'id providerId modelCode displayName status isDefault currency inputPricePerMillion outputPricePerMillion maxOutputTokens temperature' },
  prompts: { table: 'ai_prompt_versions', fields: 'id templateCode version status createdAt publishedAt' },
  tools: { table: 'ai_tool_definitions', fields: 'id name version module riskLevel status requiredPermissions requiresConfirmation requiresApproval' },
  'tool-executions': { table: 'ai_tool_executions', scope: 'company', fields: 'id toolName toolVersion status startedAt finishedAt' },
  'knowledge/sources': { table: 'ai_knowledge_sources', scope: 'shared', fields: 'id sourceType scope classification status documentCount chunkCount lastIndexedAt' },
  'knowledge/indexing-jobs': { table: 'ai_indexing_jobs', scope: 'company', fields: 'id sourceId kind status attempts createdAt nextAttemptAt' },
  'actions/approvals': { table: 'ai_action_approvals', scope: 'company', fields: 'id toolName riskLevel status expiresAt createdAt' },
  'safety-incidents': { table: 'ai_safety_incidents', scope: 'company', fields: 'id category severity status createdAt' },
  usage: { table: 'ai_usage_accounts', scope: 'company', month: true, fields: 'id period usedMessages usedTokens usedToolExecutions quotaMessages quotaTokens quotaToolExecutions alertThresholdPercent' },
  evaluations: { table: 'ai_evaluations', fields: 'id code version status lastScore lastRunAt' },
  feedback: { table: 'ai_feedback', scope: 'company', fields: 'id rating category createdAt' },
  performance: { table: 'ai_model_invocations', scope: 'company', fields: 'id providerId modelId status latencyMs fallbackUsed createdAt' },
  settings: { table: 'ai_safety_policies', fields: 'id scopeKey version status updatedAt' },
  audit: { table: 'audit_logs', fields: 'id action entityType entityId actorUserId createdAt' },
} as const satisfies Record<string, ListDefinition>;

export type AiPlatformList = keyof typeof platformAiLists;
interface PageOptions { limit: number; page: number; period?: string; companyId?: number }
const unit = new SequelizeAiUnitOfWork();
const quoted = (name: string) => '"' + name + '"';

function query<T extends object>(sql: string, replacements: Record<string, string | number> = {}, transaction?: Transaction) {
  return sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT, transaction });
}

async function forCompany<T>(companyId: number, run: () => Promise<T>): Promise<T> {
  if (!await CompanyModel.findByPk(companyId, { attributes: ['id'] })) throw new NotFoundError('Company');
  return unit.run(companyId, run);
}

export async function listAiPlatform(section: AiPlatformList, { page, limit, period, companyId }: PageOptions) {
  const definition: ListDefinition = platformAiLists[section];
  const clauses: string[] = [];
  const params: Record<string, string | number> = { limit, offset: (page - 1) * limit };
  if (definition.scope && companyId !== undefined) {
    clauses.push('"companyId" = :companyId');
    params.companyId = companyId;
  } else if (definition.scope) {
    clauses.push('"companyId" IS NULL');
  }
  if (definition.month && period) {
    clauses.push('period = :period');
    params.period = period;
  }
  if (section === 'audit') clauses.push('"companyId" IS NULL AND action LIKE \'platform.ai.%\'');
  const read = async () => {
    const source = ' FROM ' + quoted(definition.table) + (clauses.length ? ' WHERE ' + clauses.join(' AND ') : '');
    const fields = definition.fields.split(' ').map(quoted).join(', ');
    const { transaction } = aiQueryOptions();
    const [items, counts] = await Promise.all([
      query('SELECT ' + fields + source + ' ORDER BY "createdAt" DESC, id DESC LIMIT :limit OFFSET :offset', params, transaction),
      query<{ total: number }>('SELECT COUNT(*) AS total' + source, params, transaction),
    ]);
    return { items, page, limit, total: Number(counts[0].total) };
  };
  return definition.scope && companyId !== undefined ? forCompany(companyId, read) : read();
}

export async function aiDashboard(companyId: number | undefined, period: string) {
  if (companyId === undefined) {
    const [row] = await query<Record<string, number>>(`SELECT
      (SELECT COUNT(*) FROM ai_model_providers WHERE status = 'ACTIVE') AS "activeProviders",
      (SELECT COUNT(*) FROM ai_model_configurations WHERE status = 'ACTIVE') AS "activeModels",
      (SELECT COUNT(*) FROM ai_prompt_versions WHERE status = 'PUBLISHED') AS "publishedPrompts",
      (SELECT COUNT(*) FROM ai_tool_definitions WHERE status = 'ACTIVE') AS "activeTools"`);
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]));
  }

  return forCompany(companyId, async () => {
    const { transaction } = aiQueryOptions();
    const from = new Date(period + '-01T00:00:00+01:00');
    const days = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).getUTCDate();
    const to = new Date(from.getTime() + days * 86400000);
    const timestamp = (value: Date) => value.toISOString().replace('T', ' ').replace('Z', ' +00:00');
    const params = { companyId, period, from: timestamp(from), to: timestamp(to) };
    const company = ' WHERE "companyId" = :companyId';
    const dates = company + ' AND "createdAt" >= :from AND "createdAt" < :to';
    const [row] = await query<Record<string, number | null>>(`SELECT
      (SELECT COUNT(*) FROM ai_conversations${company} AND status = 'ACTIVE') AS "activeConversations",
      (SELECT COUNT(*) FROM ai_interactions${dates} AND status = 'COMPLETED') AS processed,
      (SELECT COUNT(*) FROM ai_interactions${dates} AND status = 'FAILED') AS failed,
      (SELECT COUNT(*) FROM ai_tool_executions${dates}) AS tools,
      (SELECT COUNT(*) FROM ai_action_approvals${company} AND status = 'CONFIRMED' AND "requiresApproval" = TRUE AND "expiresAt" > CURRENT_TIMESTAMP) AS approvals,
      (SELECT COUNT(*) FROM ai_safety_incidents${dates}) AS incidents,
      (SELECT COALESCE(SUM("usedTokens"), 0) FROM ai_usage_accounts${company} AND period = :period) AS tokens,
      (SELECT AVG("latencyMs") FROM ai_model_invocations${dates}) AS "averageLatencyMs"`, params, transaction);
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value == null ? null : Math.round(Number(value))]));
  });
}

export async function aiCosts(companyId: number, period: string, page: number, limit: number) {
  return forCompany(companyId, async () => {
    const { transaction } = aiQueryOptions();
    const group = '"providerId", "modelId", currency, estimated';
    const source = ' FROM ai_cost_records WHERE "companyId" = :companyId AND period = :period';
    const params = { companyId, period, limit, offset: (page - 1) * limit };
    const [rows, counts] = await Promise.all([
      query<{ providerId: string; modelId: string; currency: string; estimated: boolean; amount: string | number }>(
        'SELECT ' + group + ', SUM(amount) AS amount' + source + ' GROUP BY ' + group + ' ORDER BY ' + group + ' LIMIT :limit OFFSET :offset',
        params, transaction),
      query<{ total: number }>('SELECT COUNT(*) AS total FROM (SELECT 1' + source + ' GROUP BY ' + group + ') AS totals', params, transaction),
    ]);
    return {
      items: rows.map(row => ({ ...row, id: [row.providerId, row.modelId, row.currency, row.estimated].join('/'), amount: Number(row.amount) })),
      page, limit, total: Number(counts[0].total),
    };
  });
}

export async function aiCompanies(search: string, page: number, limit: number) {
  const numeric = /^[1-9]\d{0,9}$/.test(search) && Number(search) <= 2147483647;
  const where = search ? numeric ? { id: Number(search) } : { name: { [Op.like]: '%' + search.replace(/[\\%_]/g, '') + '%' } } : {};
  const { rows, count } = await CompanyModel.findAndCountAll({
    attributes: ['id', 'name'], where, order: [['name', 'ASC'], ['id', 'ASC']], offset: (page - 1) * limit, limit,
  });
  return { items: rows.map(row => ({ id: row.id, name: row.name })), page, limit, total: count };
}
