import { UserValidationService } from '../../domain/services/user-validation.service';

import { User } from '../../domain/entities/user.entity';

export class UserValidationServiceImpl implements UserValidationService {
  async validateCreate(input: {
    name: string;
    email: string;
    phone?: string | null;
  }): Promise<void> {
    if (!input.name?.trim()) {
      throw new Error('User name is required.');
    }

    if (!input.email?.trim()) {
      throw new Error('User email is required.');
    }
  }

  async validateCreation(user: User): Promise<void> {
    if (!user.name || !user.name.getValue()?.trim()) {
      throw new Error('User name is required.');
    }

    if (!user.email || !user.email.getValue()?.trim()) {
      throw new Error('User email is required.');
    }
  }

  async validateUpdate(input: {
    name?: string;
    email?: string;
    phone?: string | null;
  }): Promise<void> {
    if (input.name !== undefined && !input.name.trim()) {
      throw new Error('User name cannot be empty.');
    }

    if (input.email !== undefined && !input.email.trim()) {
      throw new Error('User email cannot be empty.');
    }
  }

  async ensureEmailAvailable(email: string, ignoredUserId?: number): Promise<void> {
    if (!email?.trim()) {
      throw new Error('User email is required.');
    }
  }
}
