import { SecurityEventLogger } from "../../security/security-event.logger";

export interface PasswordChangedEvent {
    eventName: string;

    accountId: number;

    userId: number;

    occurredAt: Date;
}

export class PasswordChangedHandler {
    constructor(
        private readonly securityLogger: SecurityEventLogger,
    ) { }

    public async handle(
        event: PasswordChangedEvent,
    ): Promise<void> {
        this.securityLogger.warning({
            event: "PASSWORD_CHANGED",

            accountId: event.accountId,

            userId: event.userId,
        });
    }
}