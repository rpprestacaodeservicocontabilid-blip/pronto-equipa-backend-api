import { SecurityEventLogger } from "../../security/security-event.logger";

export interface UserCreatedEvent {
    eventName: string;

    userId: number;

    email: string;

    occurredAt: Date;
}

export class UserCreatedHandler {
    constructor(
        private readonly securityLogger: SecurityEventLogger,
    ) { }

    public async handle(
        event: UserCreatedEvent,
    ): Promise<void> {
        this.securityLogger.info({
            event: "USER_CREATED",
            userId: event.userId,
            metadata: {
                email: event.email,
            },
        });
    }
}