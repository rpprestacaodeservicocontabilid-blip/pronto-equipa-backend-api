export interface SecurityGateway {
  hashPassword(password: string): Promise<string>;

  comparePassword(password: string, hash: string): Promise<boolean>;

  generateToken(length?: number): Promise<string>;

  generateAccessToken(payload: Record<string, unknown>): Promise<string>;

  generateRefreshToken(payload: Record<string, unknown>): Promise<string>;

  hashToken(token: string): Promise<string>;

  compareToken(token: string, hash: string): Promise<boolean>;
}
