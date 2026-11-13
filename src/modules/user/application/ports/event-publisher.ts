export interface DomainEvent {
    readonly eventName: string;
    readonly occurredAt: Date;
}

export interface EventPublisher {
    publish(event: DomainEvent): Promise<void>;

    publishMany(
        events: DomainEvent[],
    ): Promise<void>;
}