import { AiQuotaExceededError } from '../errors/ai-domain.error';

export interface AiQuotaLimits {
  quotaTokens: number | null;
  quotaMessages: number | null;
  quotaToolExecutions: number | null;
  maxConcurrentInteractions: number;
}

export interface AiQuotaPolicyInput {
  profile: string;
  subscriptionLimits?: Partial<AiQuotaLimits>;
  tenantLimits?: Partial<AiQuotaLimits>;
}

/**
 * Política de quotas (RF-AI-064/065/066, RN-AI-027).
 *
 * Os limites são combinados por ordem crescente de autoridade:
 * padrão do perfil → limites do plano (subscriptions) → limites
 * específicos do tenant. O menor valor aplicável vence.
 */
const PROFILE_DEFAULTS: Readonly<Record<string, AiQuotaLimits>> = {
  PLATFORM_ADMIN: {
    quotaTokens: 2_000_000,
    quotaMessages: 5_000,
    quotaToolExecutions: 5_000,
    maxConcurrentInteractions: 10,
  },
  COMPANY_ADMIN: {
    quotaTokens: 1_000_000,
    quotaMessages: 3_000,
    quotaToolExecutions: 3_000,
    maxConcurrentInteractions: 5,
  },
  HR_MANAGER: {
    quotaTokens: 800_000,
    quotaMessages: 2_500,
    quotaToolExecutions: 2_500,
    maxConcurrentInteractions: 5,
  },
  HR_SPECIALIST: {
    quotaTokens: 500_000,
    quotaMessages: 1_500,
    quotaToolExecutions: 1_500,
    maxConcurrentInteractions: 3,
  },
  FINANCE_MANAGER: {
    quotaTokens: 500_000,
    quotaMessages: 1_500,
    quotaToolExecutions: 1_500,
    maxConcurrentInteractions: 3,
  },
  SUPERVISOR: {
    quotaTokens: 250_000,
    quotaMessages: 800,
    quotaToolExecutions: 500,
    maxConcurrentInteractions: 2,
  },
  EMPLOYEE: {
    quotaTokens: 150_000,
    quotaMessages: 500,
    quotaToolExecutions: 200,
    maxConcurrentInteractions: 2,
  },
  SUPPORT_AGENT: {
    quotaTokens: 400_000,
    quotaMessages: 1_200,
    quotaToolExecutions: 1_000,
    maxConcurrentInteractions: 3,
  },
};

export class AiQuotaPolicyService {
  /** Combina os limites, escolhendo o menor valor não nulo. */
  resolve(input: AiQuotaPolicyInput): AiQuotaLimits {
    const base = PROFILE_DEFAULTS[input.profile] ?? PROFILE_DEFAULTS.EMPLOYEE;
    const combine = (key: keyof AiQuotaLimits): number => {
      const candidates = [
        base[key],
        input.subscriptionLimits?.[key],
        input.tenantLimits?.[key],
      ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      return candidates.length ? Math.min(...candidates) : 0;
    };

    return {
      quotaTokens: combine('quotaTokens'),
      quotaMessages: combine('quotaMessages'),
      quotaToolExecutions: combine('quotaToolExecutions'),
      maxConcurrentInteractions: combine('maxConcurrentInteractions'),
    };
  }

  /** Estimativa de tokens de um pedido — usada ANTES de chamar o modelo. */
  estimateTokens(prompt: string, historyMessages = 0): number {
    // Heurística conservadora: ~4 caracteres por token em português.
    const promptTokens = Math.ceil(String(prompt ?? '').length / 4);
    return promptTokens + historyMessages * 400 + 500;
  }

  assertWithinBudget(estimatedTokens: number, availableTokens: number | null): void {
    if (availableTokens !== null && estimatedTokens > availableTokens)
      throw new AiQuotaExceededError(
        'O pedido estimado excede a quota disponível para este período. Reduza a mensagem ou contacte o administrador.',
      );
  }

  defaults(): Readonly<Record<string, AiQuotaLimits>> {
    return PROFILE_DEFAULTS;
  }
}
