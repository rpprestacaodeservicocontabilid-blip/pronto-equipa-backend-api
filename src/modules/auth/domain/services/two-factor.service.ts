export interface TwoFactorService {
  generateSecret(): Promise<string>;

  generateCode(secret: string): Promise<string>;

  verifyCode(secret: string, code: string): Promise<boolean>;
}
