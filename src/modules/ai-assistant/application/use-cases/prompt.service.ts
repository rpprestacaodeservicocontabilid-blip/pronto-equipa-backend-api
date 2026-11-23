import { AiPromptVersion } from '../../domain/entities/ai-prompt-version.entity';
import { AiNotFoundError, AiValidationError } from '../../domain/errors/ai-domain.error';
import type { AiAdminRepository } from '../../domain/repositories/ai-admin.repository';
import type { AiAuditPort } from '../ports/ai-audit.port';
import type { AiPromptView } from '../dto/ai-admin.dto';
import { AiActorContext, AiContextService } from './context.service';
import { toPromptView } from './ai-views';

const DEFAULT_TEMPLATE = 'AI_ASSISTANT_SYSTEM';

/**
 * Casos de uso de prompts versionados (RF-AI-054 a RF-AI-056,
 * RNF-AI-014).
 *
 * O conteúdo é imutável depois de publicado e cada interacção regista
 * a versão efectivamente utilizada (RN-AI-013).
 */
export class AiPromptService {
  constructor(
    private readonly admin: AiAdminRepository,
    private readonly contextService: AiContextService,
    private readonly audit: AiAuditPort,
  ) {}

  async list(
    actor: AiActorContext,
    filter: { templateCode?: string; status?: string; limit?: number } = {},
  ): Promise<AiPromptView[]> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:prompts:read');

    const versions = await this.admin.listPromptVersions({
      templateCode: filter.templateCode,
      status: filter.status,
      limit: Math.min(200, Math.max(1, Number(filter.limit) || 50)),
    });
    return versions.map(toPromptView);
  }

  async create(
    actor: AiActorContext,
    input: {
      templateCode?: string;
      content: string;
      modelHints?: string[];
      status?: string;
    },
  ): Promise<AiPromptView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:prompts:manage');

    const templateCode = input.templateCode ?? DEFAULT_TEMPLATE;
    const existing = await this.admin.listPromptVersions({ templateCode, limit: 100 });
    const nextVersion = existing.reduce((max, item) => Math.max(max, item.version), 0) + 1;

    const version = AiPromptVersion.create({
      templateCode,
      version: nextVersion,
      content: input.content,
      modelHints: input.modelHints,
      status: input.status,
      createdBy: actor.actorId,
    });
    await this.admin.savePromptVersion(version);

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: 'ai-prompt.created',
      entityType: 'ai_prompt_version',
      entityId: version.id,
      correlationId: actor.requestId ?? null,
      after: { templateCode, version: nextVersion, status: version.status },
    });

    return toPromptView(version);
  }

  /** Publica a versão mais recente e arquiva a anterior (RF-AI-056). */
  async publish(actor: AiActorContext, templateCode: string): Promise<AiPromptView> {
    const context = await this.contextService.load(actor);
    await this.contextService.assertPermission(context, 'ai-assistant:prompts:manage');

    const versions = await this.admin.listPromptVersions({ templateCode, limit: 200 });
    if (!versions.length) throw new AiNotFoundError('Template de prompt inexistente.');

    const candidate = [...versions].sort((a, b) => b.version - a.version)[0];
    if (candidate.status === 'ARCHIVED')
      throw new AiValidationError('Não é possível publicar uma versão arquivada.');

    for (const version of versions.filter((item) => item.status === 'PUBLISHED')) {
      await this.admin.savePromptVersion(
        AiPromptVersion.restore({
          id: version.id,
          templateCode: version.templateCode,
          version: version.version,
          content: version.content,
          modelHints: [...version.modelHints],
          status: 'ARCHIVED',
          createdBy: version.createdBy,
          publishedAt: version.publishedAt,
          createdAt: version.createdAt,
        }),
      );
    }

    const published = candidate.publish();
    await this.admin.savePromptVersion(published);

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      action: 'ai-prompt.published',
      entityType: 'ai_prompt_version',
      entityId: published.id,
      correlationId: actor.requestId ?? null,
      after: { templateCode, version: published.version },
    });

    return toPromptView(published);
  }

  /** Versão publicada usada no fluxo de geração (fallback implícito). */
  async published(templateCode = DEFAULT_TEMPLATE): Promise<AiPromptVersion | null> {
    return this.admin.findPublishedPrompt(templateCode);
  }
}
