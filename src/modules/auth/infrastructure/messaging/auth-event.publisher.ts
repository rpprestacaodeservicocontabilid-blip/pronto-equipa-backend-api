import { EventPublisher } from "../../application/ports/event-publisher";

export interface AuthEventBus {
    publish(event: unknown): Promise<void>;
}

export class AuthEventPublisher
    implements EventPublisher {
    constructor(
        private readonly eventBus: AuthEventBus,
    ) { }

    public async publish(
        event: unknown,
    ): Promise<void> {
        await this.eventBus.publish(event);
    }
}