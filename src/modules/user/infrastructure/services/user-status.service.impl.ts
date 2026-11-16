import { UserStatusService } from '../../domain/services/user-status.service';

import { User } from '../../domain/entities/user.entity';

export class UserStatusServiceImpl implements UserStatusService {
  async activate(user: User): Promise<void> {
    user.activate();
  }

  async deactivate(user: User): Promise<void> {
    user.deactivate();
  }

  async suspend(user: User): Promise<void> {
    user.suspend();
  }

  async block(user: User): Promise<void> {
    user.block();
  }

  canLogin(user: User): boolean {
    return user.isActive();
  }
}
