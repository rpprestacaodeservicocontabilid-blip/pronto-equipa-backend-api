export interface GoogleGateway {
  authenticate(accessToken: string): Promise<GoogleIdentity | null>;
}

export interface GoogleIdentity {
  providerAccountId: string;

  email: string;

  name: string;

  emailVerified: boolean;

  avatarUrl: string | null;
}
