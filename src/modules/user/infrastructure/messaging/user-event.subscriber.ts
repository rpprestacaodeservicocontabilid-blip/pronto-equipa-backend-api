export interface UserEventBusSubscriber {
    subscribe(
        eventName: string,
        handler: (
            event: unknown,
        ) => Promise<void>,
    ): void;
}

export class UserEventSubscriber {
    constructor(
        private readonly eventBus: UserEventBusSubscriber,
    ) { }

    subscribe(
        eventName: string,
        handler: (
            event: unknown,
        ) => Promise<void>,
    ): void {
        this.eventBus.subscribe(
            eventName,
            handler,
        );
    }
}