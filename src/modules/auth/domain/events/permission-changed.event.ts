import { DomainEvent } from './domain-event';
import { Permission } from '../enums/permission.enum';

export class PermissionChangedEvent extends DomainEvent {
  constructor(
    public readonly authAccountId: number,
    public readonly permission: Permission,
    public readonly granted: boolean,
  ) {
    super();
  }

  public get eventName(): string {
    return 'auth.permission.changed';
  }
}
