import { z } from 'zod';

const channel = z.enum(['IN_APP', 'EMAIL', 'SMS']);
export const notificationDataSchemas = {
  RULE: z
    .object({
      code: z.string(),
      eventType: z.string(),
      template: z.string(),
      category: z.string(),
      recipients: z.array(z.number().int().positive()),
      channels: z.array(channel),
      enabled: z.boolean(),
    })
    .passthrough(),
  TEMPLATE: z
    .object({
      code: z.string(),
      subject: z.string(),
      body: z.string(),
      category: z.string(),
      mandatory: z.boolean(),
      version: z.number().int().positive(),
      actor: z.number().int(),
      publishedBy: z.number().int().optional(),
    })
    .passthrough(),
  MESSAGE: z
    .object({
      fingerprint: z.string(),
      actor: z.number().int(),
      category: z.string(),
      templateVersion: z.number().int().positive(),
      subject: z.string(),
      body: z.string(),
      scheduledAt: z.string(),
    })
    .passthrough(),
  DELIVERY: z
    .object({
      messageId: z.string(),
      channel,
      recipient: z.string().nullable(),
      subject: z.string(),
      body: z.string(),
      scheduledAt: z.string(),
      attempts: z.number().int().nonnegative(),
      readState: z.string(),
      readAt: z.string().optional(),
      providerMessageId: z.string().optional(),
      nextAttemptAt: z.number().nonnegative().optional(),
      lastError: z.string().optional(),
    })
    .passthrough(),
  PREFERENCE: z
    .object({ category: z.string(), channel: z.string(), enabled: z.boolean() })
    .passthrough(),
  QUOTA: z.object({ used: z.number().int().nonnegative() }).passthrough(),
  AUDIT: z.object({ action: z.string() }).passthrough(),
  ATTEMPT: z
    .object({
      deliveryId: z.string(),
      attempts: z.number().int().positive(),
      error: z.string().optional(),
    })
    .passthrough(),
};
export const notificationKindSchema = z.enum([
  'RULE',
  'TEMPLATE',
  'MESSAGE',
  'DELIVERY',
  'PREFERENCE',
  'QUOTA',
  'AUDIT',
  'ATTEMPT',
]);
export type NotificationKind = keyof typeof notificationDataSchemas;
export type NotificationDataMap = {
  [K in NotificationKind]: z.infer<(typeof notificationDataSchemas)[K]>;
};

export function parseNotificationData<K extends NotificationKind>(
  kind: K,
  input: unknown,
): NotificationDataMap[K] {
  const parsed = notificationDataSchemas[kind].safeParse(input);
  if (!parsed.success) throw new Error(`Invalid persisted notification payload (${kind}).`);
  // The selected schema and the returned payload share the same kind parameter.
  return parsed.data as NotificationDataMap[K];
}
