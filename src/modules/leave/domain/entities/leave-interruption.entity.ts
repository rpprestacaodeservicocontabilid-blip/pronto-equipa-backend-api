import { randomUUID } from 'crypto';
import { ValidationError } from '../../../../shared/errors/app.error';
import { LeavePeriod } from '../value-objects/leave-period.vo';

export interface LeaveInterruptionProps {
  id: string;
  companyId: number;
  requestId: string;
  startDate: string;
  endDate: string;
  reason: string;
  actorUserId: number | null;
  createdAt: Date;
}

/**
 * Interrupção autorizada de um período de férias (RN-045),
 * com os dias afectados e o motivo que a justifica.
 */
export class LeaveInterruption {
  private constructor(readonly props: LeaveInterruptionProps) {}

  static create(input: {
    companyId: number;
    requestId: string;
    startDate: string;
    endDate: string;
    reason: string;
    actorUserId?: number | null;
    now?: Date;
  }): LeaveInterruption {
    LeavePeriod.create(input.startDate, input.endDate);
    if (!input.reason || input.reason.trim().length === 0) {
      throw new ValidationError('An interruption requires a reason.');
    }

    return new LeaveInterruption({
      id: randomUUID(),
      companyId: input.companyId,
      requestId: input.requestId,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason.trim(),
      actorUserId: input.actorUserId ?? null,
      createdAt: input.now ?? new Date(),
    });
  }

  static restore(props: LeaveInterruptionProps): LeaveInterruption {
    return new LeaveInterruption(props);
  }
}
