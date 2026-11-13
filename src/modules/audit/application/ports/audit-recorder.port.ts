/**
 * Contrato de gravação de auditoria, consumido pelos restantes
 * módulos (tenancy, payroll, ...) sem depender da implementação.
 */
export interface AuditRecordInput {
    companyId: number | null;
    actorUserId: number | null;
    action: string;
    entityType: string;
    entityId?: string | number | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
}

export interface AuditRecorderPort {
    /**
     * Regista um evento de auditoria.
     *
     * Deve ser chamado depois de a operação estar confirmada.
     * Falhas de auditoria são registadas no log e não propagadas —
     * nunca podem perder a operação de negócio já concluída.
     */
    record(input: AuditRecordInput): Promise<void>;
}
