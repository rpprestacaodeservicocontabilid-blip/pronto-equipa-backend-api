import { randomUUID } from 'crypto';

import { LeaveDays } from '../value-objects/leave-days.vo';
import { LeavePeriod } from '../value-objects/leave-period.vo';

export interface LeaveRequestPeriodProps {
  id: string;
  companyId: number;
  requestId: string;
  startDate: string;
  endDate: string;
  calculatedDays: number;
}

/**
 * Segmento de datas de um pedido de férias, com a duração já
 * calculada segundo o calendário laboral (RN-016).
 *
 * Um pedido pode conter vários segmentos (fraccionamento).
 */
export class LeaveRequestPeriod {
  private constructor(readonly props: LeaveRequestPeriodProps) {}

  static create(input: {
    companyId: number;
    requestId: string;
    startDate: string;
    endDate: string;
    calculatedDays: number;
  }): LeaveRequestPeriod {
    LeavePeriod.create(input.startDate, input.endDate);
    LeaveDays.create(input.calculatedDays);

    return new LeaveRequestPeriod({
      id: randomUUID(),
      companyId: input.companyId,
      requestId: input.requestId,
      startDate: input.startDate,
      endDate: input.endDate,
      calculatedDays: input.calculatedDays,
    });
  }

  static restore(props: LeaveRequestPeriodProps): LeaveRequestPeriod {
    return new LeaveRequestPeriod(props);
  }
}
