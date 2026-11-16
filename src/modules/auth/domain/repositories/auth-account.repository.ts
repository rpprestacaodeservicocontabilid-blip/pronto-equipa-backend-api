import { AuthAccount } from '../entities/auth-account.entity';
import { AuthProvider } from '../enums/auth-provider.enum';
import { Email } from '../value-objects/email.vo';

export interface AuthAccountRepository {
  save(account: AuthAccount): Promise<AuthAccount>;

  findById(id: number): Promise<AuthAccount | null>;

  findByUserId(userId: number): Promise<AuthAccount | null>;

  findByEmail(email: Email | string): Promise<AuthAccount | null>;

  findByProviderAccount(
    provider: AuthProvider,
    providerAccountId: string,
  ): Promise<AuthAccount | null>;

  findByUserIdAndProvider(userId: number, provider: AuthProvider): Promise<AuthAccount | null>;

  linkProvider(input: {
    userId: number;
    provider: AuthProvider;
    providerAccountId: string;
    email: string;
  }): Promise<AuthAccount>;

  unlinkProvider(userId: number, provider: AuthProvider): Promise<void>;

  createOAuthAccount(input: {
    userId: number;
    email: string;
    provider: AuthProvider;
    providerAccountId: string;
    emailVerified: boolean;
  }): Promise<AuthAccount>;

  existsByEmail(email: Email | string): Promise<boolean>;

  delete(id: number): Promise<void>;
}
