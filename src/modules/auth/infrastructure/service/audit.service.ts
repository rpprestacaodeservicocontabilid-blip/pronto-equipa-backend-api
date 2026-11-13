import {
    AuditServicePort,
} from "../../application/ports/audit-service.port";

export class AuditService
    implements AuditServicePort {
    async record(
        input: {
            userId: number | null;
            action: string;
            resource: string | null;
            resourceId: string | null;
            ipAddress: string | null;
            userAgent: string | null;
            metadata?: Record<
                string,
                unknown
            >;
        },
    ): Promise<void> {
        console.info(
            "[AUTH AUDIT]",
            {
                ...input,
                occurredAt: new Date(),
            },
        );
    }
}
