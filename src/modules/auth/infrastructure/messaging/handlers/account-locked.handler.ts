import { SecurityEventLogger } from "../../security/security-event.logger";

export interface AccountLockedEvent {
    eventName: string;

    accountId: number;

    userId: number;

    reason: string;

    occurredAt: Date;
}

export class AccountLockedHandler {
    constructor(
        private readonly securityLogger: SecurityEventLogger,
    ) { }

    public async handle(
        event: AccountLockedEvent,
    ): Promise<void> {
        this.securityLogger.critical({
            event: "ACCOUNT_LOCKED",

            accountId: event.accountId,

            userId: event.userId,

            metadata: {
                reason: event.reason,
            },
        });
    }
}