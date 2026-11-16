/**
 * Verificador contextual de permissões (RBAC por empresa).
 *
 * A verificação é COMPOSTA por três camadas:
 *
 *   Identidade (JWT) → Permissão → Contexto empresarial
 *
 * Ou seja: estar autenticado não chega; é preciso ter a permissão
 * no âmbito da empresa resolvida — o papel do utilizador DENTRO
 * da empresa (`company_members.roleId`) define o acesso.
 */
export interface TenantPermissionCheckerPort {
  /**
   * `true` quando o utilizador tem a permissão indicada na empresa
   * indicada (membro activo + papel com a permissão).
   */
  hasPermission(userId: number, companyId: number, permission: string): Promise<boolean>;
}
