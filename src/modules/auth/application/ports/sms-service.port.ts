export interface SendSmsInput {
  phoneNumber: string;

  message: string;
}

export interface SmsServicePort {
  send(input: SendSmsInput): Promise<void>;
}
