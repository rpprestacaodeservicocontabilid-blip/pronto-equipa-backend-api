import { z } from 'zod';

import { NotificationProvider } from '../domain/notification';

const providerResponseSchema = z.object({
  status: z.enum(['ACCEPTED', 'DELIVERED', 'UNKNOWN']).catch('UNKNOWN'),
  providerMessageId: z.string().optional().catch(undefined),
});
/** The configured HTTPS gateway must honour Idempotency-Key. Secrets stay in environment. */
export class HttpNotificationProvider implements NotificationProvider {
  async send(input: Parameters<NotificationProvider['send']>[0]) {
    const endpoint = process.env[`NOTIFICATIONS_${input.channel}_URL`],
      token = process.env[`NOTIFICATIONS_${input.channel}_TOKEN`];
    if (!endpoint || !token) throw new Error(`Canal ${input.channel} não configurado.`);
    if (new URL(endpoint).protocol !== 'https:') throw new Error('O prestador exige HTTPS.');
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.id,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
    } catch {
      return { status: 'UNKNOWN' as const };
    }
    if (response.status === 429 || response.status >= 500)
      throw new Error(`Prestador temporariamente indisponível: ${response.status}`);
    if (!response.ok) return { status: 'REJECTED' as const };
    const body: unknown = await response.json().catch(() => null);
    const parsed = providerResponseSchema.safeParse(body);
    return parsed.success ? parsed.data : { status: 'UNKNOWN' as const };
  }
}
