export abstract class DomainEvent {
  public readonly occurredAt: Date;

  protected constructor() {
    this.occurredAt = new Date();
  }

  public abstract get eventName(): string;
}
