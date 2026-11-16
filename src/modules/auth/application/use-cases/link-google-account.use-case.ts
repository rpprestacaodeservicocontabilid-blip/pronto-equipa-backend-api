import { AuthAccountRepository } from '../../domain/repositories/auth-account.repository';
import { AuthProvider } from '../../domain/enums/auth-provider.enum';

import { OAuthProviderPort } from '../ports/oauth-provider.port';

export interface LinkGoogleAccountInput {
  userId: number;

  code: string;
}

export class LinkGoogleAccountUseCase {
  constructor(
    private readonly authAccountRepository: AuthAccountRepository,

    private readonly oauthProvider: OAuthProviderPort,
  ) {}

  async execute(input: LinkGoogleAccountInput): Promise<void> {
    const profile = await this.oauthProvider.authenticate(input.code);

    const existing = await this.authAccountRepository.findByProviderAccount(
      AuthProvider.GOOGLE,
      profile.providerId,
    );

    if (existing) {
      throw new Error('Google account is already linked.');
    }

    await this.authAccountRepository.linkProvider({
      userId: input.userId,
      provider: AuthProvider.GOOGLE,
      providerAccountId: profile.providerId,
      email: profile.email,
    });
  }
}
