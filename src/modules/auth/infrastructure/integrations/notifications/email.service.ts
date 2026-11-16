import { EmailServicePort } from '../../../application/ports/email-service.port';

export class EmailService implements EmailServicePort {
  async send(input: {
    to: string;
    subject: string;
    template: string;
    variables?: Record<string, unknown>;
  }): Promise<void> {
    const endpoint = process.env.AUTH_EMAIL_PROVIDER_URL;
    if (!endpoint) {
      if (process.env.NODE_ENV === 'production')
        throw new Error('Email provider is not configured.');
      return;
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.AUTH_NOTIFICATION_API_KEY
          ? { authorization: `Bearer ${process.env.AUTH_NOTIFICATION_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`Email provider request failed (${response.status}).`);
  }
}
