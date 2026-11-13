import { ValidationError } from '../../../../shared/errors/app.error';
import {
  LeaveMovementType,
  isLeaveMovementType,
} from '../value-objects/leave-balance.vo';

export interface LeaveBalanceMovementProps {
  id: number | null;
  companyId: number;
  accountId: string;
  entitlementId: string | null;
  movementType: LeaveMovementType;
  /** Dias ASSINADOS: ACCRUAL/RELEASE +, RESERVATION/USAGE −, ADJUSTMENT ±. */
  days: number;
  /** Referência ao pedido de férias (ou outro documento justificativo). */
  referenceId: string | null;
  /** Motivo obrigatório nos ADJUSTMENT (RN-013). */
  reason: string | null;
  actorUserId: number | null;
  createdAt: Date;
}

/** Sinal esperado por tipo de movimento — invariantes do ledger. */
const SIGN_RULES: Record<LeaveMovementType, 'positive' | 'negative' | 'signed'> = {
  ACCRUAL: 'positive',
  RESERVATION: 'negative',
  RELEASE: 'positive',
  USAGE: 'negative',
  ADJUSTMENT: 'signed',
};

/**
 * Movimento imutável do ledger de saldo (RN-011 / RN-014).
 *
 * Os movimentos consolidados não são apagados nem editados —
 * rectificações produzem NOVOS movimentos, preservando o histórico.
 */
export class LeaveBalanceMovement {
  private constructor(readonly props: LeaveBalanceMovementProps) {}

  static create(input: {
    companyId: number;
    accountId: string;
    entitlementId?: string | null;
    movementType: LeaveMovementType;
    days: number;
    referenceId?: string | null;
    reason?: string | null;
    actorUserId?: number | null;
    now?: Date;
  }): LeaveBalanceMovement {
    if (!isLeaveMovementType(input.movementType)) {
      throw new ValidationError('Unknown leave movement type.');
    }
    if (!Number.isInteger(input.days) || input.days === 0) {
      throw new ValidationError('Leave movement days must be a non-zero integer.');
    }
    const rule = SIGN_RULES[input.movementType];
    if (rule === 'positive' && input.days < 0) {
      throw new ValidationError(`${input.movementType} movements must be positive.`);
    }
    if (rule === 'negative' && input.days > 0) {
      throw new ValidationError(`${input.movementType} movements must be negative.`);
    }
    if (input.movementType === 'ADJUSTMENT') {
      // RN-013: ajustes exigem motivo e responsável.
      if (!input.reason || input.reason.trim().length === 0) {
        throw new ValidationError('Balance adjustments require a reason.');
      }
      if (!input.actorUserId) {
        throw new ValidationError('Balance adjustments require an actor.');
      }
    }

    return new LeaveBalanceMovement({
      id: null,
      companyId: input.companyId,
      accountId: input.accountId,
      entitlementId: input.entitlementId ?? null,
      movementType: input.movementType,
      days: input.days,
      referenceId: input.referenceId ?? null,
      reason: input.reason?.trim() ?? null,
      actorUserId: input.actorUserId ?? null,
      createdAt: input.now ?? new Date(),
    });
  }
}
