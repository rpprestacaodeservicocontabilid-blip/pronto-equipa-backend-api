import { AppError } from '../../../../shared/errors/app.error';

/**
 * Erros de domínio do módulo `leave`.
 *
 * Todos herdam de `AppError` (statusCode + code), pelo que o
 * `error.middleware.ts` devolve `{success:false,error:{message,code,...}}`
 * sem tradução adicional. Os codes são estáveis e podem ser
 * tratados pela UI.
 */

/** Pedido/conta inexistente OU pertencente a outro tenant. */
export class LeaveNotFoundError extends AppError {
  constructor(resource: string = 'Leave request') {
    super(`${resource} not found.`, 404, 'LEAVE_NOT_FOUND');
    this.name = 'LeaveNotFoundError';
  }
}

/** Conta de férias duplicada para o mesmo trabalhador/empresa (CA-002). */
export class LeaveAccountExistsError extends AppError {
  constructor() {
    super('A leave account already exists for this employee.', 409, 'LEAVE_ACCOUNT_EXISTS');
    this.name = 'LeaveAccountExistsError';
  }
}

/** Saldo insuficiente para aprovar/consumir (RN-012 / CA-008). */
export class InsufficientBalanceError extends AppError {
  constructor(available: number, required: number) {
    super(
      `Insufficient leave balance: ${available} day(s) available, ${required} required.`,
      422,
      'INSUFFICIENT_BALANCE',
    );
    this.name = 'InsufficientBalanceError';
  }
}

/** Transição de estado inválida para o pedido. */
export class InvalidLeaveTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(
      `Leave request cannot transition from ${from} to ${to}.`,
      409,
      'INVALID_LEAVE_TRANSITION',
    );
    this.name = 'InvalidLeaveTransitionError';
  }
}

/** Período sobreposto a outro pedido activo do mesmo trabalhador (RN-017). */
export class LeavePeriodOverlapError extends AppError {
  constructor(conflictingRequestId?: string) {
    super(
      conflictingRequestId
        ? `Leave period overlaps request ${conflictingRequestId}.`
        : 'Leave period overlaps another active leave request.',
      409,
      'LEAVE_PERIOD_OVERLAP',
    );
    this.name = 'LeavePeriodOverlapError';
    this.conflictingRequestId = conflictingRequestId;
  }

  public readonly conflictingRequestId?: string;
}

/** Auto-aprovação proibida pela política do módulo (RN / CA-030). */
export class SelfApprovalForbiddenError extends AppError {
  constructor() {
    super('The request creator cannot approve the same request.', 403, 'SELF_APPROVAL_FORBIDDEN');
    this.name = 'SelfApprovalForbiddenError';
  }
}

/** Conflito de versão — recurso alterado por outra operação. */
export class LeaveVersionConflictError extends AppError {
  constructor() {
    super('Leave request was changed by another operation.', 409, 'LEAVE_VERSION_CONFLICT');
    this.name = 'LeaveVersionConflictError';
  }
}

/** Operação de saldo já reconciliada — impede movimentos duplicados (RN-048). */
export class LeaveAlreadyReconciledError extends AppError {
  constructor() {
    super('Leave balance was already reconciled for this request.', 409, 'LEAVE_ALREADY_RECONCILED');
    this.name = 'LeaveAlreadyReconciledError';
  }
}
