export interface NotificationGateway {
  sendEmailVerification(input: { email: string; name: string; token: string }): Promise<void>;

  sendPasswordReset(input: { email: string; name: string; token: string }): Promise<void>;

  sendAccountLocked(input: { email: string; name: string }): Promise<void>;

  sendSecurityAlert(input: { email: string; name: string; message: string }): Promise<void>;
}
