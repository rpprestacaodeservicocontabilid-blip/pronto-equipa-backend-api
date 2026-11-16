import { AuthAccountRepository } from '../../domain/repositories/auth-account.repository';
import { AuthProvider } from '../../domain/enums/auth-provider.enum';

export interface UnlinkGoogleAccountInput {
  userId: number;
}

export class UnlinkGoogleAccountUseCase {
  constructor(private readonly authAccountRepository: AuthAccountRepository) {}

  async execute(input: UnlinkGoogleAccountInput): Promise<void> {
    const account = await this.authAccountRepository.findByUserIdAndProvider(
      input.userId,
      AuthProvider.GOOGLE,
    );

    if (!account) {
      throw new Error('Google account is not linked.');
    }

    await this.authAccountRepository.unlinkProvider(input.userId, AuthProvider.GOOGLE);
  }
}
