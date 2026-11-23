import { AiNotFoundError, AiValidationError } from '../../domain/errors/ai-domain.error';
import type {
  AiAdminRepository,
  AiModelConfigurationRecord,
  AiModelProviderRecord,
} from '../../domain/repositories/ai-admin.repository';
import type { AiAuditPort } from '../ports/ai-audit.port';
import type { AiModelGatewayPort } from '../ports/ai-model-gateway.port';
import type { AiModelView, AiProviderView } from '../dto/ai-admin.dto';
import { AiActorContext, AiContextService } from './context.service';
import { toModelView, toProviderView } from './ai-views';

export interface AiProviderInput {
  id: string;
  code: string;
  name: string;
  status?: 'ACTIVE' | 'DISABLED';
  baseUrl?: string | null;
  apiKeyEnv?: string | null;
  timeoutMs?: number;
  priority?: number;
}

export interface AiModelInput {
  id: string;
  providerId: string;
  modelCode: string;
  displayName: string;
  status?: 'ACTIVE' | 'DISABLED' | 'FALLBACK';
  isDefault?: boolean;
  temperature?: number | null;
  maxOutputTokens?: number | null;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  currency?: string;
  capabilities?: string[];
}

/**
 * Casos de uso de fornecedores e modelos (RF-AI-051 a RF-AI-053,
 * RF-AI-077 a RF-AI-080).
 *
 * A selecção efectiva do modelo é resolvida na infraestrutura; aqui
 * administra-se a configuração e a saúde dos fornecedores.
 */
export class AiModelService {
  constructor(
    private readonly admin: AiAdminRepository,
    private readonly gateway: AiModelGatewayPort,
    private readonly contextService: AiContextService,
    private readonly audit: AiAuditPort,
  ) {}

  async listProviders(actor: AiActorContext): Promise<AiProviderView[]> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:models:read');
    return (await this.admin.listModelProviders()).map(toProviderView);
  }

  async saveProvider(actor: AiActorContext, input: AiProviderInput): Promise<AiProviderView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:models:manage');

    const provider = await this.admin.saveModelProvider({
      id: input.id,
      code: input.code,
      name: input.name,
      status: input.status ?? 'ACTIVE',
      baseUrl: input.baseUrl ?? null,
      apiKeyEnv: input.apiKeyEnv ?? null,
      timeoutMs: input.timeoutMs ?? 30_000,
      priority: input.priority ?? 100,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: 'ai-model.provider.saved',
      entityType: 'ai_model_provider',
      entityId: provider.id,
      after: { code: provider.code, status: provider.status },
    });

    return toProviderView(provider);
  }

  async listModels(
    actor: AiActorContext,
    filter: { providerId?: string; status?: string } = {},
  ): Promise<AiModelView[]> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:models:read');
    return (await this.admin.listModelConfigurations(filter)).map(toModelView);
  }

  async saveModel(actor: AiActorContext, input: AiModelInput): Promise<AiModelView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:models:manage');

    const provider = await this.admin.findModelProvider(input.providerId);
    if (!provider) throw new AiNotFoundError('Fornecedor de modelo inexistente.');
    if (provider.status !== 'ACTIVE')
      throw new AiValidationError('O fornecedor indicado não está activo.');

    if (input.isDefault) await this.admin.clearDefaultModel(input.providerId);

    const model = await this.admin.saveModelConfiguration({
      id: input.id,
      providerId: input.providerId,
      modelCode: input.modelCode,
      displayName: input.displayName,
      status: input.status ?? 'ACTIVE',
      isDefault: input.isDefault ?? false,
      temperature: input.temperature ?? null,
      maxOutputTokens: input.maxOutputTokens ?? null,
      inputPricePerMillion: input.inputPricePerMillion ?? 0,
      outputPricePerMillion: input.outputPricePerMillion ?? 0,
      currency: input.currency ?? 'AOA',
      capabilities: input.capabilities ?? [],
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: 'ai-model.configuration.saved',
      entityType: 'ai_model_configuration',
      entityId: model.id,
      after: { modelCode: model.modelCode, status: model.status, isDefault: model.isDefault },
    });

    return toModelView(model);
  }

  /** Saúde dos fornecedores (circuit breaker), para observabilidade. */
  async health(
    actor: AiActorContext,
  ): Promise<Array<{ providerId: string; available: boolean; reason?: string }>> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:models:read');

    const providers = await this.admin.listModelProviders();
    const results: Array<{ providerId: string; available: boolean; reason?: string }> = [];
    for (const provider of providers.filter((item) => item.status === 'ACTIVE')) {
      try {
        results.push({ providerId: provider.id, ...(await this.gateway.health(provider.id)) });
      } catch (error) {
        results.push({
          providerId: provider.id,
          available: false,
          reason: error instanceof Error ? error.message : 'indisponível',
        });
      }
    }
    return results;
  }

  /** Modelo activo por omissão, usado no fluxo de geração. */
  async defaultModel(): Promise<AiModelConfigurationRecord | null> {
    const configurations = await this.admin.listModelConfigurations({ status: 'ACTIVE' });
    return (
      configurations.find((item) => item.isDefault) ??
      configurations.find((item) => item.status === 'FALLBACK') ??
      configurations[0] ??
      null
    );
  }

  /** Registo completo do fornecedor (para o adaptador de transporte). */
  async provider(providerId: string): Promise<AiModelProviderRecord | null> {
    return this.admin.findModelProvider(providerId);
  }

  /** Modelos disponíveis no fornecedor, para validação em administração. */
  async availableModels(): Promise<
    Array<{ providerId: string; modelId: string; available: boolean }>
  > {
    return this.gateway.listModels();
  }
}
