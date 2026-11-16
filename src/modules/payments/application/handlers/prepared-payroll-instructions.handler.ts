import { ConflictError } from '../../../../shared/errors/app.error';
import { PaymentsApplicationService } from '../use-cases/payments-application.service';

interface PreparedInstructionRecord {
  id: string;
  runId: string;
  employeeId: string;
  key: string;
  data: { resultId: string; amount: string; currency: string; reference?: string };
}

/** Adapts the payroll outbox event into idempotent payments-domain instructions. */
export class PreparedPayrollInstructionsHandler {
  constructor(private readonly payments: PaymentsApplicationService) {}

  async handle(message: unknown) {
    const event = message as {
      eventType?: string;
      eventVersion?: number;
      companyId?: number;
      actorUserId?: number;
      instructions?: PreparedInstructionRecord[];
    };
    if (
      event?.eventType !== 'payroll.payment-instructions.prepared' ||
      event.eventVersion !== 1 ||
      !Number.isInteger(event.companyId) ||
      !Array.isArray(event.instructions)
    ) {
      throw new ConflictError('Invalid payroll payment-instructions event envelope.');
    }
    const companyId = event.companyId!;
    const actorUserId = event.actorUserId ?? 0;
    const created = [];
    for (const record of event.instructions) {
      if (
        !record?.data?.resultId ||
        !record.employeeId ||
        !record.key ||
        !record.data.amount ||
        !record.data.currency
      ) {
        throw new ConflictError('Invalid payroll payment-instructions event record.');
      }
      created.push(
        await this.payments.createInstruction(companyId, actorUserId, {
          payrollResultId: record.data.resultId,
          employeeId: record.employeeId,
          amount: record.data.amount,
          currency: record.data.currency,
          paymentType: 'REGULAR_SALARY',
          method: 'BANK_TRANSFER',
          idempotencyKey: record.key,
          reason: record.data.reference,
        }),
      );
    }
    return { imported: created.length, instructions: created };
  }
}
