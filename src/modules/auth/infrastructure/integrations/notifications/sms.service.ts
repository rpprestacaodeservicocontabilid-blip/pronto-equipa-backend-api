import { SmsServicePort } from '../../../application/ports/sms-service.port';

export class SmsService implements SmsServicePort {
  async send(input: { phoneNumber: string; message: string }): Promise<void> {
    const endpoint = process.env.AUTH_SMS_PROVIDER_URL;
    if (!endpoint) {
      if (process.env.NODE_ENV === 'production') throw new Error('SMS provider is not configured.');
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
    if (!response.ok) throw new Error(`SMS provider request failed (${response.status}).`);
  }
}
