export interface SecurityCheckInput {
  userId?: number;

  ipAddress: string | null;

  userAgent: string | null;

  action: string;
}

export interface SecurityCheckResult {
  allowed: boolean;

  requiresTwoFactor: boolean;

  riskScore: number;

  reason: string | null;
}

export interface SecurityServicePort {
  check(input: SecurityCheckInput): Promise<SecurityCheckResult>;

  recordFailedAttempt(input: SecurityCheckInput): Promise<void>;

  recordSuccessfulAttempt(input: SecurityCheckInput): Promise<void>;
}
