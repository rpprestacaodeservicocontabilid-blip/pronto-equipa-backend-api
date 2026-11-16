export interface GoogleProfile {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  emailVerified: boolean;
}

export class GoogleOAuthMapper {
  static toProfile(data: any): GoogleProfile {
    return {
      id: data.sub,

      email: data.email,

      name: data.name ?? `${data.given_name ?? ''} ${data.family_name ?? ''}`.trim(),

      firstName: data.given_name,

      lastName: data.family_name,

      picture: data.picture,

      emailVerified: data.email_verified === true,
    };
  }
}
