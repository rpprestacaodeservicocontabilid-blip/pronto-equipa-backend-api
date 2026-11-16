import { DomainEvent } from './domain-event';
import { Role } from '../enums/role.enum';

export class RoleAssignedEvent extends DomainEvent {
  constructor(
    public readonly userId: number,
    public readonly authAccountId: number,
    public readonly role: Role,
  ) {
    super();
  }

  public get eventName(): string {
    return 'auth.role.assigned';
  }
}
