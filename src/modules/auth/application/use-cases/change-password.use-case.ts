import { AuthAccountRepository } from '../../domain/repositories/auth-account.repository';
import { Password } from '../../domain/value-objects/password.vo';

import { PasswordHasherPort } from '../ports/password-hasher.port';
import { SessionManagerPort } from '../ports/session-manager.port';

export interface ChangePasswordInput {
  userId: number;

  currentPassword: string;

  newPassword: string;
}

export class ChangePasswordUseCase {
  constructor(
    private readonly authAccountRepository: AuthAccountRepository,

    private readonly passwordHasher: PasswordHasherPort,

    private readonly sessionManager: SessionManagerPort,
  ) {}

  async execute(input: ChangePasswordInput): Promise<void> {
    const account = await this.authAccountRepository.findByUserId(input.userId);

    if (!account) {
      throw new Error('Authentication account not found.');
    }

    const currentPasswordHash = account.password?.getValue();

    if (!currentPasswordHash) {
      throw new Error('This account does not have a local password.');
    }

    const valid = await this.passwordHasher.compare(input.currentPassword, currentPasswordHash);

    if (!valid) {
      throw new Error('Current password is incorrect.');
    }

    const passwordHash = await this.passwordHasher.hash(input.newPassword);

    account.changePassword(Password.fromHash(passwordHash));

    await this.authAccountRepository.save(account);

    // Boa prática: invalidar sessões após alteração
    // da password.
    await this.sessionManager.revokeAllSessions(input.userId);
  }
}
