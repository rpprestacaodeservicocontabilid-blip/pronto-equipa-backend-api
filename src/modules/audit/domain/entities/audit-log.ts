export interface AuditLogProps {
    id: number;
    companyId: number | null;
    actorUserId: number | null;
    action: string;
    entityType: string;
    entityId: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
}

export interface CreateAuditLogProps {
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

export interface AuditLogPrimitives {
    id: number;
    companyId: number | null;
    actorUserId: number | null;
    action: string;
    entityType: string;
    entityId: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
}

/**
 * Entity — Registo de auditoria (imutável).
 *
 * Não expõe métodos de mutação: registos de auditoria são apenas
 * criados, nunca editados nem removidos pela aplicação.
 */
export class AuditLog {
    private constructor(
        private props: AuditLogProps,
    ) { }

    static create(props: CreateAuditLogProps): AuditLog {
        return new AuditLog({
            id: 0,
            companyId: props.companyId ?? null,
            actorUserId: props.actorUserId ?? null,
            action: props.action,
            entityType: props.entityType,
            entityId:
                props.entityId === undefined || props.entityId === null
                    ? null
                    : String(props.entityId),
            before: props.before ?? null,
            after: props.after ?? null,
            ipAddress: props.ipAddress ?? null,
            userAgent: props.userAgent ?? null,
            createdAt: new Date(),
        });
    }

    static reconstitute(props: AuditLogProps): AuditLog {
        return new AuditLog(props);
    }

    toPrimitives(): AuditLogPrimitives {
        return { ...this.props };
    }
}
