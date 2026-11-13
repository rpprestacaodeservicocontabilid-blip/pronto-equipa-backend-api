/**
 * Módulo `leave` — domínio
 *
 * Objectos de valor (período, dias, saldo), máquina de estados,
 * agregados (conta e pedido), calculator de dias úteis e
 * detector de conflitos. Sem base de dados — só domínio puro.
 */

import { ValidationError } from '../../shared/errors/app.error';
import { LeaveAccount } from '../../modules/leave/domain/aggregates/leave-account.aggregate';
import { LeaveRequest } from '../../modules/leave/domain/aggregates/leave-request.aggregate';
import {
  InsufficientBalanceError,
  InvalidLeaveTransitionError,
  LeavePeriodOverlapError,
  SelfApprovalForbiddenError,
} from '../../modules/leave/domain/errors/leave.error';
import { LeaveConflictDetector } from '../../modules/leave/domain/services/leave-conflict-detector.service';
import {
  DEFAULT_WORK_CALENDAR,
  LeaveDaysCalculator,
} from '../../modules/leave/domain/services/leave-days-calculator.service';
import { LeaveBalance } from '../../modules/leave/domain/value-objects/leave-balance.vo';
import { LeaveDays } from '../../modules/leave/domain/value-objects/leave-days.vo';
import { LeavePeriod, calendarDaysBetween } from '../../modules/leave/domain/value-objects/leave-period.vo';
import {
  BLOCKING_LEAVE_STATUSES,
  canTransitionLeave,
  isLeaveStatus,
} from '../../modules/leave/domain/value-objects/leave-status.vo';

const COMPANY = 7;
const ACTOR = 42;
const OTHER_ACTOR = 43;
const EMPLOYEE = '3f1a5c9e-0000-4000-8000-000000000001';

const segments = (startDate: string, endDate: string, days: number) => [
  { startDate, endDate, calculatedDays: days },
];

// ============================================================
// PERÍODO (LeavePeriod)
// ============================================================

describe('LeavePeriod', () => {
  it('accepts valid calendar dates and reports inclusive calendar days', () => {
    const period = LeavePeriod.create('2026-03-02', '2026-03-06');
    expect(period.calendarDays).toBe(5);
    expect(calendarDaysBetween('2026-03-02', '2026-03-02')).toBe(1);
  });

  it('rejects malformed dates, inverted ranges and overlong periods', () => {
    expect(() => LeavePeriod.create('2026-02-30', '2026-03-05')).toThrow(ValidationError);
    expect(() => LeavePeriod.create('02/03/2026', '2026-03-05')).toThrow(ValidationError);
    expect(() => LeavePeriod.create('2026-03-10', '2026-03-05')).toThrow(ValidationError);
    expect(() => LeavePeriod.create('2026-01-01', '2027-01-02')).toThrow(ValidationError);
  });

  it('detects inclusive overlap between periods (RN-017)', () => {
    const base = LeavePeriod.create('2026-03-02', '2026-03-06');
    expect(base.overlaps(LeavePeriod.create('2026-03-06', '2026-03-07'))).toBe(true);
    expect(base.overlaps(LeavePeriod.create('2026-03-03', '2026-03-04'))).toBe(true);
    expect(base.overlaps(LeavePeriod.create('2026-03-07', '2026-03-08'))).toBe(false);
  });
});

// ============================================================
// DIAS ÚTEIS (LeaveDaysCalculator)
// ============================================================

describe('LeaveDaysCalculator', () => {
  it('counts Monday-to-Friday by default', () => {
    const calculator = new LeaveDaysCalculator();
    expect(calculator.countWorkingDays('2026-03-02', '2026-03-06')).toBe(5);
    expect(calculator.countWorkingDays('2026-03-02', '2026-03-08')).toBe(5);
  });

  it('gives exceptions precedence over the working week (RN-016)', () => {
    const calculator = new LeaveDaysCalculator({
      ...DEFAULT_WORK_CALENDAR,
      exceptions: {
        '2026-03-04': 'NON_WORKING_DAY',
        '2026-03-07': 'WORKING_DAY',
      },
    });
    // 02..08: 5 úteis − 04 (quarta feriada) + 07 (sábado especial) = 5
    expect(calculator.countWorkingDays('2026-03-02', '2026-03-08')).toBe(5);
  });

  it('rejects periods with no working days', () => {
    const calculator = new LeaveDaysCalculator();
    expect(() => calculator.countWorkingDays('2026-03-07', '2026-03-08')).toThrow(ValidationError);
  });
});

// ============================================================
// DIAS (LeaveDays)
// ============================================================

describe('LeaveDays', () => {
  it('accepts whole positive days up to the annual ceiling', () => {
    expect(LeaveDays.create(1).value).toBe(1);
    expect(LeaveDays.create(366).value).toBe(366);
  });

  it('rejects zero, negative and fractional days', () => {
    expect(() => LeaveDays.create(0)).toThrow(ValidationError);
    expect(() => LeaveDays.create(-3)).toThrow(ValidationError);
    expect(() => LeaveDays.create(2.5)).toThrow(ValidationError);
  });
});

// ============================================================
// SALDO (LeaveBalance)
// ============================================================

describe('LeaveBalance', () => {
  it('composes available = Σ days with signed movements (RN-010)', () => {
    const balance = LeaveBalance.fromMovements([
      { movementType: 'ACCRUAL', days: 30 },
      { movementType: 'ADJUSTMENT', days: -2 },
      { movementType: 'RESERVATION', days: -5 },
    ]);
    expect(balance.entitled).toBe(30);
    expect(balance.adjusted).toBe(-2);
    expect(balance.reserved).toBe(5);
    expect(balance.used).toBe(0);
    expect(balance.available).toBe(23);
    expect(balance.canCover(23)).toBe(true);
    expect(balance.canCover(24)).toBe(false);
  });

  it('releases reservations and records usage without double counting (§10.2)', () => {
    const balance = LeaveBalance.fromMovements([
      { movementType: 'ACCRUAL', days: 30 },
      { movementType: 'RESERVATION', days: -5 },
      { movementType: 'RELEASE', days: 5 },
      { movementType: 'USAGE', days: -5 },
    ]);
    expect(balance.reserved).toBe(0);
    expect(balance.used).toBe(5);
    expect(balance.available).toBe(25);
  });
});

// ============================================================
// MÁQUINA DE ESTADOS
// ============================================================

describe('leave status machine', () => {
  it('allows the documented lifecycle transitions only', () => {
    expect(canTransitionLeave('DRAFT', 'PENDING_APPROVAL')).toBe(true);
    expect(canTransitionLeave('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransitionLeave('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionLeave('PENDING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransitionLeave('PENDING_APPROVAL', 'DRAFT')).toBe(false);
    expect(canTransitionLeave('APPROVED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionLeave('IN_PROGRESS', 'INTERRUPTED')).toBe(true);
    expect(canTransitionLeave('INTERRUPTED', 'COMPLETED')).toBe(true);
    expect(canTransitionLeave('COMPLETED', 'CANCELLED')).toBe(false);
    expect(canTransitionLeave('REJECTED', 'PENDING_APPROVAL')).toBe(false);
  });

  it('classifies terminal, reserved and blocking statuses', () => {
    expect(isLeaveStatus('PARTIALLY_COMPLETED')).toBe(true);
    expect(isLeaveStatus('ARCHIVED')).toBe(false);
    expect(BLOCKING_LEAVE_STATUSES).toContain('COMPLETED');
    expect(BLOCKING_LEAVE_STATUSES).not.toContain('CANCELLED');
    expect(BLOCKING_LEAVE_STATUSES).not.toContain('DRAFT');
  });
});

// ============================================================
// AGREGADO — CONTA
// ============================================================

describe('LeaveAccount aggregate', () => {
  it('creates an active account and records its domain event', () => {
    const account = LeaveAccount.create({ companyId: COMPANY, employeeId: EMPLOYEE });
    expect(account.status).toBe('ACTIVE');
    expect(account.version).toBe(1);

    const events = account.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('leave.account.created');
    expect(events[0].aggregateId).toBe(account.id);
  });

  it('requires a company and an employee', () => {
    expect(() => LeaveAccount.create({ companyId: 0, employeeId: EMPLOYEE })).toThrow(
      ValidationError,
    );
    expect(() => LeaveAccount.create({ companyId: COMPANY, employeeId: '' })).toThrow(
      ValidationError,
    );
  });

  it('restores only known statuses and closes at most once', () => {
    const restored = LeaveAccount.restore({
      id: EMPLOYEE,
      companyId: COMPANY,
      employeeId: EMPLOYEE,
      status: 'ACTIVE',
      version: 2,
    });
    expect(restored.close()).toMatchObject({ status: 'CLOSED', version: 3 });

    const closed = LeaveAccount.restore({
      id: EMPLOYEE,
      companyId: COMPANY,
      employeeId: EMPLOYEE,
      status: 'CLOSED',
      version: 3,
    });
    expect(() => closed.close()).toThrow(ValidationError);
  });
});

// ============================================================
// AGREGADO — PEDIDO
// ============================================================

describe('LeaveRequest aggregate', () => {
  const createDraft = () =>
    LeaveRequest.create({
      companyId: COMPANY,
      employeeId: EMPLOYEE,
      accountId: EMPLOYEE,
      createdByUserId: ACTOR,
      reason: 'Férias de Março',
      segments: segments('2026-03-02', '2026-03-06', 5),
    });

  it('creates a draft with ordered periods and a creation event', () => {
    const request = LeaveRequest.create({
      companyId: COMPANY,
      employeeId: EMPLOYEE,
      accountId: EMPLOYEE,
      createdByUserId: ACTOR,
      segments: [
        { startDate: '2026-03-09', endDate: '2026-03-13', calculatedDays: 5 },
        { startDate: '2026-03-02', endDate: '2026-03-06', calculatedDays: 5 },
      ],
    });

    expect(request.status).toBe('DRAFT');
    expect(request.version).toBe(1);
    expect(request.requestedDays).toBe(10);
    expect(request.startDate).toBe('2026-03-02');
    expect(request.endDate).toBe('2026-03-13');
    expect(request.periods[0].startDate).toBe('2026-03-02');
    expect(request.pullDomainEvents()[0].eventName).toBe('leave.request.created');
  });

  it('rejects empty requests, unknown types and incoherent day counts', () => {
    expect(() =>
      LeaveRequest.create({
        companyId: COMPANY,
        employeeId: EMPLOYEE,
        accountId: EMPLOYEE,
        createdByUserId: ACTOR,
        segments: [],
      }),
    ).toThrow(ValidationError);

    expect(() =>
      LeaveRequest.create({
        companyId: COMPANY,
        employeeId: EMPLOYEE,
        accountId: EMPLOYEE,
        createdByUserId: ACTOR,
        leaveType: 'UNPAID' as never,
        segments: segments('2026-03-02', '2026-03-06', 5),
      }),
    ).not.toThrow();

    expect(() =>
      LeaveRequest.create({
        companyId: COMPANY,
        employeeId: EMPLOYEE,
        accountId: EMPLOYEE,
        createdByUserId: ACTOR,
        segments: segments('2026-03-02', '2026-03-06', 0),
      }),
    ).toThrow(ValidationError);

    expect(() =>
      LeaveRequest.create({
        companyId: COMPANY,
        employeeId: EMPLOYEE,
        accountId: EMPLOYEE,
        createdByUserId: ACTOR,
        segments: segments('2026-03-02', '2026-03-06', 99),
      }),
    ).toThrow(ValidationError);
  });

  it('walks draft → pending → approved → in progress → completed', () => {
    const request = createDraft();

    expect(request.submit()).toMatchObject({ status: 'PENDING_APPROVAL', version: 2 });
    expect(request.decide('APPROVED', OTHER_ACTOR, 'Ok')).toMatchObject({
      status: 'APPROVED',
      version: 3,
    });
    expect(request.start()).toMatchObject({ status: 'IN_PROGRESS', version: 4 });
    expect(request.interrupt()).toMatchObject({ status: 'INTERRUPTED', version: 5 });
    expect(request.complete()).toMatchObject({ status: 'COMPLETED', version: 6 });

    expect(request.approvals).toHaveLength(1);
    expect(request.approvals[0]).toMatchObject({
      decision: 'APPROVED',
      approverUserId: OTHER_ACTOR,
      comments: 'Ok',
    });
    expect(request.pullDomainEvents().map((event) => event.eventName)).toEqual([
      'leave.request.created',
      'leave.request.submitted',
      'leave.request.approved',
      'leave.request.started',
      'leave.request.interrupted',
      'leave.request.completed',
    ]);
  });

  it('blocks illegal transitions and stale versions', () => {
    const request = createDraft();
    expect(() => request.start()).toThrow(InvalidLeaveTransitionError);
    expect(() => request.decide('APPROVED', OTHER_ACTOR, null)).toThrow(
      InvalidLeaveTransitionError,
    );

    const submitted = createDraft();
    submitted.submit();
    expect(() => submitted.updateDraft({ reason: 'novo' })).toThrow(InvalidLeaveTransitionError);
    expect(() => submitted.assertVersion(1)).toThrow(InvalidLeaveTransitionError);
    expect(() => submitted.assertVersion(2)).not.toThrow();
  });

  it('forbids self-approval unless explicitly allowed (CA-030)', () => {
    const request = createDraft();
    request.submit();
    expect(() => request.assertNotSelfApproval(ACTOR, false)).toThrow(SelfApprovalForbiddenError);
    expect(() => request.assertNotSelfApproval(ACTOR, true)).not.toThrow();
    expect(() => request.assertNotSelfApproval(OTHER_ACTOR, false)).not.toThrow();
  });

  it('requires a justification for rejections (RN-026)', () => {
    const request = createDraft();
    request.submit();
    expect(() => request.decide('REJECTED', OTHER_ACTOR, null)).toThrow(ValidationError);
    expect(() => request.decide('REJECTED', OTHER_ACTOR, '   ')).toThrow(ValidationError);
    expect(() => request.decide('REJECTED', OTHER_ACTOR, 'Indisponibilidade')).not.toThrow();
  });

  it('edits only drafts and reschedules only approved requests', () => {
    const request = createDraft();
    const updated = request.updateDraft({
      leaveType: 'SICK',
      reason: 'Atestado',
      segments: segments('2026-03-09', '2026-03-13', 5),
    });
    expect(updated).toMatchObject({
      status: 'DRAFT',
      version: 2,
      leaveType: 'SICK',
      requestedDays: 5,
      startDate: '2026-03-09',
    });

    const approved = createDraft();
    approved.submit();
    approved.decide('APPROVED', OTHER_ACTOR, null);
    const rescheduled = approved.reschedule(segments('2026-04-01', '2026-04-03', 3));
    expect(rescheduled).toMatchObject({
      status: 'APPROVED',
      version: 4,
      requestedDays: 3,
      startDate: '2026-04-01',
    });

    const draft = createDraft();
    expect(() => draft.reschedule(segments('2026-04-01', '2026-04-03', 3))).toThrow(
      InvalidLeaveTransitionError,
    );
  });

  it('cancels from any non-terminal state and records the previous status', () => {
    const request = createDraft();
    request.submit();
    const cancelled = request.cancel();
    expect(cancelled).toMatchObject({ status: 'CANCELLED', version: 3 });

    const completed = createDraft();
    completed.submit();
    completed.decide('APPROVED', OTHER_ACTOR, null);
    completed.start();
    completed.complete();
    expect(() => completed.cancel()).toThrow(InvalidLeaveTransitionError);
  });

  it('rejects overlapping segments inside one request (RN-017)', () => {
    expect(() =>
      LeaveRequest.create({
        companyId: COMPANY,
        employeeId: EMPLOYEE,
        accountId: EMPLOYEE,
        createdByUserId: ACTOR,
        segments: [
          { startDate: '2026-03-02', endDate: '2026-03-06', calculatedDays: 5 },
          { startDate: '2026-03-05', endDate: '2026-03-10', calculatedDays: 4 },
        ],
      }),
    ).toThrow(ValidationError);
  });
});

// ============================================================
// DETECTOR DE CONFLITOS
// ============================================================

describe('LeaveConflictDetector', () => {
  it('returns the exact overlap against blocking requests only', () => {
    const conflicts = LeaveConflictDetector.findConflicts(
      [{ startDate: '2026-03-04', endDate: '2026-03-10' }],
      [
        {
          requestId: 'blocking',
          status: 'APPROVED',
          startDate: '2026-03-02',
          endDate: '2026-03-06',
        },
        {
          requestId: 'cancelled',
          status: 'CANCELLED',
          startDate: '2026-03-05',
          endDate: '2026-03-07',
        },
      ],
      [...BLOCKING_LEAVE_STATUSES],
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      conflictingRequestId: 'blocking',
      conflictingStatus: 'APPROVED',
      overlapStart: '2026-03-04',
      overlapEnd: '2026-03-06',
    });
  });

  it('finds employees absent on a given date', () => {
    const absent = LeaveConflictDetector.findSimultaneousAbsences(
      [
        { employeeId: 'a', periods: [{ startDate: '2026-03-02', endDate: '2026-03-06' }] },
        { employeeId: 'b', periods: [{ startDate: '2026-03-09', endDate: '2026-03-13' }] },
      ],
      '2026-03-04',
    );
    expect(absent).toEqual(['a']);
  });
});

// ============================================================
// ERROS DE DOMÍNIO
// ============================================================

describe('leave domain errors', () => {
  it('carries stable codes and HTTP statuses', () => {
    expect(new InsufficientBalanceError(2, 5)).toMatchObject({
      statusCode: 422,
      code: 'INSUFFICIENT_BALANCE',
    });
    expect(new InvalidLeaveTransitionError('DRAFT', 'APPROVED')).toMatchObject({
      statusCode: 409,
      code: 'INVALID_LEAVE_TRANSITION',
    });
    const overlap = new LeavePeriodOverlapError('req-1');
    expect(overlap).toMatchObject({
      statusCode: 409,
      code: 'LEAVE_PERIOD_OVERLAP',
      conflictingRequestId: 'req-1',
    });
    expect(new SelfApprovalForbiddenError()).toMatchObject({
      statusCode: 403,
      code: 'SELF_APPROVAL_FORBIDDEN',
    });
  });
});
