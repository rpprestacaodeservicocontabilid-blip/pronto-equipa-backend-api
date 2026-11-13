import { ValidationError } from '../../../../shared/errors/app.error';

export const APPROVAL_DECISIONS = ['APPROVED', 'REJECTED', 'RETURNED'] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export interface LeaveApprovalProps {
  id: number | null;
  companyId: number;
  requestId: string;
  approverUserId: number;
  decision: ApprovalDecision;
  comments: string | null;
  decidedAt: Date;
}

/**
 * Decisão registada sobre um pedido: data, responsável e
 * resultado (RN-031). As decisões são imutáveis — uma nova
 * decisão sobre o mesmo pedido acrescenta um novo registo.
 */
export class LeaveApproval {
  private constructor(readonly props: LeaveApprovalProps) {}

  static create(input: {
    companyId: number;
    requestId: string;
    approverUserId: number;
    decision: ApprovalDecision;
    comments?: string | null;
    now?: Date;
  }): LeaveApproval {
    if (!(APPROVAL_DECISIONS as readonly string[]).includes(input.decision)) {
      throw new ValidationError('Unknown approval decision.');
    }
    if (!Number.isSafeInteger(input.approverUserId) || input.approverUserId <= 0) {
      throw new ValidationError('An approval requires a responsible user.');
    }
    if (input.decision === 'REJECTED' && !input.comments?.trim()) {
      // RN-026: rejeição exige justificação.
      throw new ValidationError('Rejections require a justification.');
    }

    return new LeaveApproval({
      id: null,
      companyId: input.companyId,
      requestId: input.requestId,
      approverUserId: input.approverUserId,
      decision: input.decision,
      comments: input.comments?.trim() || null,
      decidedAt: input.now ?? new Date(),
    });
  }
}
