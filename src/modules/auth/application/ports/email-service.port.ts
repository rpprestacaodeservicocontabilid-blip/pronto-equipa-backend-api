export interface SendEmailInput {
  to: string;

  subject: string;

  template: string;

  variables?: Record<string, unknown>;
}

export interface EmailServicePort {
  send(input: SendEmailInput): Promise<void>;
}
