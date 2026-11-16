import { OAuthProviderPort, OAuthProfile } from '../../../application/ports/oauth-provider.port';
import { AppError } from '../../../../../shared/errors/app.error';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class GoogleOAuthProvider implements OAuthProviderPort {
  constructor(private readonly config: GoogleOAuthConfig) {}

  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,

      redirect_uri: this.config.redirectUri,

      response_type: 'code',

      scope: 'openid email profile',

      ...(state ? { state } : {}),
    });

    return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  }

  async authenticate(code: string): Promise<OAuthProfile> {
    if (!this.config.clientId || !this.config.clientSecret || !this.config.redirectUri) {
      throw new AppError('Google OAuth is not configured.', 501, 'OAUTH_NOT_CONFIGURED');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      throw new AppError('Invalid Google authorization code.', 401, 'INVALID_OAUTH_CODE');
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string;
    };

    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      throw new AppError('Could not fetch Google profile.', 502, 'OAUTH_PROFILE_ERROR');
    }

    const profile = (await profileResponse.json()) as {
      sub: string;
      email: string;
      given_name?: string;
      family_name?: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };

    return {
      providerId: profile.sub,
      email: profile.email,
      firstName: profile.given_name ?? null,
      lastName: profile.family_name ?? null,
      displayName: profile.name ?? null,
      avatarUrl: profile.picture ?? null,
      emailVerified: profile.email_verified ?? false,
    };
  }

  async revoke(providerId: string): Promise<void> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new AppError('Google OAuth is not configured.', 501, 'OAUTH_NOT_CONFIGURED');
    }

    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(providerId)}`, {
      method: 'POST',
    });
  }
}
