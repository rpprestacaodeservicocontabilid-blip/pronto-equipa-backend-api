import {
    EventPublisher,
    DomainEvent,
} from "../../application/ports/event-publisher";

export interface UserEventBus {
    publish(
        event: DomainEvent,
    ): Promise<void>;
}

export class UserEventPublisher
    implements EventPublisher {
    constructor(
        private readonly eventBus: UserEventBus,
    ) { }

    async publish(
        event: DomainEvent,
    ): Promise<void> {
        await this.eventBus.publish(event);
    }

    async publishMany(
        events: DomainEvent[],
    ): Promise<void> {
        for (const event of events) {
            await this.publish(event);
        }
    }
}