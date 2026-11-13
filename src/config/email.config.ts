import type { EnvVars } from "./env";

export interface EmailConfig {
  /** `false` quando não há provider configurado. */
  enabled: boolean;
  providerUrl: string;
  apiKey: string;
  from: {
    name: string;
    address: string;
  };
  auth: {
    providerUrl: string;
    smsProviderUrl: string;
    notificationApiKey: string;
  };
}

/**
 * Identidade de envio de e-mails e credenciais de notificação.
 * Sem ligações — o adaptador decide o transportador consoante
 * o `providerUrl`.
 */
export function createEmailConfig(env: Pick<EnvVars,
  | "EMAIL_PROVIDER_URL"
  | "EMAIL_API_KEY"
  | "EMAIL_FROM_NAME"
  | "EMAIL_FROM_ADDRESS"
  | "AUTH_EMAIL_PROVIDER_URL"
  | "AUTH_SMS_PROVIDER_URL"
  | "AUTH_NOTIFICATION_API_KEY">): EmailConfig {
  return {
    enabled: env.EMAIL_PROVIDER_URL.length > 0,
    providerUrl: env.EMAIL_PROVIDER_URL,
    apiKey: env.EMAIL_API_KEY,
    from: {
      name: env.EMAIL_FROM_NAME,
      address: env.EMAIL_FROM_ADDRESS,
    },
    auth: {
      providerUrl: env.AUTH_EMAIL_PROVIDER_URL,
      smsProviderUrl: env.AUTH_SMS_PROVIDER_URL,
      notificationApiKey: env.AUTH_NOTIFICATION_API_KEY,
    },
  };
}
