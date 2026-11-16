export interface RiskAnalysisService {
  analyze(context: RiskAnalysisContext): Promise<RiskAnalysisResult>;
}

export interface RiskAnalysisContext {
  userId: number;

  ipAddress: string | null;

  userAgent: string | null;

  deviceId: string | null;

  country?: string | null;

  loginAttempts: number;
}

export interface RiskAnalysisResult {
  score: number;

  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  requiresTwoFactor: boolean;

  shouldBlock: boolean;

  reasons: string[];
}
