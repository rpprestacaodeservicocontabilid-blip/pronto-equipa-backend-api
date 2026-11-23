import { AiForbiddenError, AiNotFoundError } from '../../domain/errors/ai-domain.error';
import { AiContextSnapshot } from '../../domain/entities/ai-context-snapshot.entity';
import type { AiConversation } from '../../domain/aggregates/ai-conversation.aggregate';
import type { AiConversationRepository } from '../../domain/repositories/ai-conversation.repository';
import type { AiToolRepository } from '../../domain/repositories/ai-tool.repository';
import {
  AiContextPolicyResult,
  AiContextPolicyService,
  AiProfile,
} from '../../domain/services/ai-context-policy.service';
import type { AiAuthorizationPort } from '../ports/ai-authorization.port';

/**
 * Identidade resolvida a partir do contexto autenticado da aplicação
 * (JWT + `X-Company-Id`). Nunca chega no corpo do pedido.
 */
export interface AiActorContext {
  tenantId: number;
  actorId: number;
  requestId?: string | null;
}

/** Contexto autorizado usado em todas as operações do assistente. */
export interface AiAuthorizedContext {
  actor: AiActorContext;
  permissions: string[];
  profile: AiProfile;
  policy: AiContextPolicyResult;
  allowedTools: string[];
}

/**
 * Caso de uso de construção do contexto autorizado (RF-AI-013 a
 * RF-AI-019, RN-AI-003/004/005).
 *
 * O contexto é derivado das permissões EFECTIVAS no momento do
 * pedido; o modelo nunca amplia o âmbito e as permissões são
 * revalidadas sempre que uma ferramenta é executada.
 */
export class AiContextService {
  private readonly policy = new AiContextPolicyService();

  constructor(
    private readonly authorization: AiAuthorizationPort,
    private readonly tools: AiToolRepository,
    private readonly conversations: AiConversationRepository,
  ) {}

  async load(actor: AiActorContext): Promise<AiAuthorizedContext> {
    const permissions = await this.authorization.listPermissions(actor.actorId, actor.tenantId);
    const profile = this.policy.resolveProfile(permissions);
    const policy = this.policy.build({
      tenantId: actor.tenantId,
      userId: actor.actorId,
      profile,
      permissions,
    });

    const registered = await this.tools.listToolDefinitions({ status: 'ACTIVE' });
    const allowedTools = this.policy.filterTools(
      registered.map((tool) => ({
        name: tool.name,
        requiredPermissions: tool.requiredPermissions,
        isActive: tool.isActive,
      })),
      policy,
      permissions,
    );

    return { actor, permissions, profile, policy: { ...policy, allowedTools }, allowedTools };
  }

  /** Revalidação de uma permissão no momento da operação. */
  async assertPermission(context: AiAuthorizedContext, permission: string): Promise<void> {
    const allowed = await this.authorization.hasPermission({
      actorId: context.actor.actorId,
      tenantId: context.actor.tenantId,
      permission,
    });
    if (!allowed) throw new AiForbiddenError(`Permissão em falta: ${permission}.`);
  }

  /** Conjunto de permissões em falta (para mensagens agregadas). */
  async assertPermissions(context: AiAuthorizedContext, permissions: readonly string[]): Promise<void> {
    const missing = await this.authorization.missingPermissions(
      context.actor.actorId,
      context.actor.tenantId,
      permissions,
    );
    if (missing.length)
      throw new AiForbiddenError(`Permissões em falta: ${missing.join(', ')}.`);
  }

  /**
   * Garante que a conversa pertence ao utilizador e ao tenant
   * (RN-AI-006) antes de qualquer leitura ou escrita.
   */
  async assertConversation(
    context: AiAuthorizedContext,
    conversationId: string,
  ): Promise<AiConversation> {
    const conversation = await this.conversations.findConversation(
      context.actor.tenantId,
      conversationId,
      context.actor.actorId,
    );
    if (!conversation) throw new AiNotFoundError('Conversa indisponível para este contexto.');
    conversation.assertBelongsTo(context.actor.tenantId, context.actor.actorId);
    return conversation;
  }

  /** Regista o contexto aplicado, para auditoria posterior (RF-AI-014). */
  async snapshot(
    context: AiAuthorizedContext,
    input: { interactionId: string; knowledgeSourceIds: string[] },
  ): Promise<AiContextSnapshot> {
    const snapshot = AiContextSnapshot.create({
      tenantId: context.actor.tenantId,
      interactionId: input.interactionId,
      policyVersion: context.policy.policyVersion,
      permissions: [...context.permissions],
      knowledgeSourceIds: input.knowledgeSourceIds,
      redactedFields: [...context.policy.redactionRules],
      toolNames: [...context.allowedTools],
    });
    return this.conversations.saveContextSnapshot(snapshot);
  }

  /** Remove campos sensíveis de um payload antes de o enviar ao modelo. */
  redact<T>(context: AiAuthorizedContext, value: T): T {
    return this.policy.redact(value, context.policy.redactionRules);
  }

  /** Política de contexto (acesso aos serviços de domínio associados). */
  get domainPolicy(): AiContextPolicyService {
    return this.policy;
  }
}
