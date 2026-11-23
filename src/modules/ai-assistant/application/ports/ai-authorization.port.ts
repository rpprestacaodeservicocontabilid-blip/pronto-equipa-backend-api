/**
 * Porta de autorização do assistente (RF-AI-013, RF-AI-019,
 * RN-AI-003/004/005).
 *
 * Verifica permissões RBAC no contexto do tenant, para além do
 * middleware de rota — necessária porque a autorização é revalidada
 * NO MOMENTO da execução da ferramenta e em tarefas assíncronas.
 */
export interface AiAuthorizationCheckInput {
  actorId: number;
  tenantId: number;
  permission: string;
}

export interface AiAuthorizationPort {
  hasPermission(input: AiAuthorizationCheckInput): Promise<boolean>;
  /** Devolve todas as permissões efectivas do actor no tenant. */
  listPermissions(actorId: number, tenantId: number): Promise<string[]>;
  /** Revalida um conjunto de permissões; devolve as em falta. */
  missingPermissions(
    actorId: number,
    tenantId: number,
    permissions: readonly string[],
  ): Promise<string[]>;
}
