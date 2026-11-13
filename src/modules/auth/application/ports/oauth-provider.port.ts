export interface OAuthProfile {
  providerId: string;

  email: string;

  firstName: string | null;

  lastName: string | null;

  displayName: string | null;

  avatarUrl: string | null;

  emailVerified: boolean;
}

export interface OAuthProviderPort {
  getAuthorizationUrl(
    state?: string,
  ): string;

  authenticate(
    code: string,
  ): Promise<OAuthProfile>;

  revoke(
    providerId: string,
  ): Promise<void>;
}