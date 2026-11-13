import { SessionManagerPort } from "../ports/session-manager.port";
import { AuditServicePort } from "../ports/audit-service.port";

export interface LogoutInput {
    userId: number;

    sessionId: number;

    ipAddress?: string | null;

    userAgent?: string | null;
}

export class LogoutUseCase {
    constructor(
        private readonly sessionManager: SessionManagerPort,

        private readonly auditService: AuditServicePort,
    ) { }

    async execute(
        input: LogoutInput,
    ): Promise<void> {
        const session =
            await this.sessionManager.getSession(
                input.sessionId,
            );

        if (
            !session ||
            session.userId !== input.userId
        ) {
            throw new Error(
                "Session not found.",
            );
        }

        await this.sessionManager.revokeSession(
            input.sessionId,
        );

        await this.auditService.record({
            userId: input.userId,
            action: "LOGOUT",
            resource: "session",
            resourceId: String(input.sessionId),
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ?? null,
        });
    }
}