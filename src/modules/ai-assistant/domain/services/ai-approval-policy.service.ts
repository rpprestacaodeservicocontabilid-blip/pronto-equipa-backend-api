import { AiActionRisk } from '../value-objects/ai-action-risk.vo';

export interface AiApprovalPolicyInput {
  riskLevel: string;
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  proposedBy: number;
  actorId: number;
}

export interface AiApprovalPolicyDecision {
  requiresConfirmation: boolean;
  requiresApproval: boolean;
  requiresIndependentApprover: boolean;
  canConfirm: boolean;
  canApprove: boolean;
  reason?: string;
}

/**
 * Política de aprovação humana (RF-AI-047/048, secção 20.2,
 * RN-AI-018, RNF-AI-020).
 *
 * A confirmação é realizada pela APLICAÇÃO (endpoint próprio) e nunca
 * interpretada a partir de uma frase gerada pelo modelo.
 */
export class AiApprovalPolicyService {
  evaluate(input: AiApprovalPolicyInput): AiApprovalPolicyDecision {
    const risk = AiActionRisk.from(input.riskLevel);
    const requiresConfirmation = input.requiresConfirmation || risk.requiresConfirmation;
    const requiresApproval = input.requiresApproval || risk.requiresApproval;
    const requiresIndependentApprover = requiresApproval;

    const canConfirm = requiresConfirmation;
    const canApprove =
      requiresApproval &&
      (!requiresIndependentApprover || input.actorId !== input.proposedBy);

    let reason: string | undefined;
    if (requiresApproval && input.actorId === input.proposedBy)
      reason = 'INDEPENDENT_APPROVER_REQUIRED';
    else if (!requiresConfirmation && !requiresApproval) reason = 'NO_APPROVAL_REQUIRED';

    return {
      requiresConfirmation,
      requiresApproval,
      requiresIndependentApprover,
      canConfirm,
      canApprove,
      reason,
    };
  }

  /** Risco a partir do qual é exigida aprovação independente. */
  approvalThreshold(): AiActionRisk {
    return AiActionRisk.from('HIGH');
  }

  /** Risco a partir do qual é exigida confirmação do utilizador. */
  confirmationThreshold(): AiActionRisk {
    return AiActionRisk.from('LOW');
  }

  /** Propostas expiram após 60 minutos por omissão. */
  defaultTtlMinutes(): number {
    return 60;
  }
}
