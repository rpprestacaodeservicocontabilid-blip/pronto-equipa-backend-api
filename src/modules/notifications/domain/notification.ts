export type Channel = 'IN_APP' | 'EMAIL' | 'SMS';
export interface NotificationRequest {
  key: string;
  category: string;
  template: string;
  variables: Record<string, string>;
  recipients: number[];
  channels: Channel[];
  scheduledAt?: string;
}
export interface NotificationDirectory {
  resolve(
    userId: number,
    companyId: number | null,
  ): Promise<{ email: string | null; phone: string | null }>;
}
export interface NotificationProvider {
  send(input: {
    id: string;
    channel: Channel;
    recipient: string;
    subject: string;
    body: string;
  }): Promise<{
    status: 'ACCEPTED' | 'DELIVERED' | 'UNKNOWN' | 'REJECTED';
    providerMessageId?: string;
  }>;
}
export const error = (message: string, statusCode = 422) =>
  Object.assign(new Error(message), { statusCode });
export function render(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_match: string, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key))
      throw error(`Variável obrigatória: ${key}`);
    return variables[key];
  });
}
