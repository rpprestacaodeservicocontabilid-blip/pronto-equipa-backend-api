export const supportTicketTypes = [
  'TECHNICAL_SUPPORT',
  'FUNCTIONAL_SUPPORT',
  'INCIDENT',
  'COMPLAINT',
  'SERVICE_REQUEST',
  'QUESTION',
  'ACCESS_REQUEST',
  'SUBSCRIPTION_SUPPORT',
  'BILLING_SUPPORT',
  'PAYROLL_SUPPORT',
  'DOCUMENT_SUPPORT',
  'SECURITY_INCIDENT',
  'FEATURE_REQUEST',
] as const;

export const supportPriorities = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
export const supportStatuses = [
  'OPEN',
  'TRIAGED',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'WAITING_INTERNAL',
  'WAITING_EXTERNAL',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
] as const;

export type SupportTicketType = (typeof supportTicketTypes)[number];
export type SupportPriority = (typeof supportPriorities)[number];
export type SupportTicketStatus = (typeof supportStatuses)[number];
export type SupportVisibility = 'PUBLIC' | 'INTERNAL';

const transitions: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  OPEN: ['TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  TRIAGED: ['ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_INTERNAL', 'CANCELLED'],
  ASSIGNED: [
    'IN_PROGRESS',
    'WAITING_CUSTOMER',
    'WAITING_INTERNAL',
    'WAITING_EXTERNAL',
    'ESCALATED',
    'CANCELLED',
  ],
  IN_PROGRESS: [
    'WAITING_CUSTOMER',
    'WAITING_INTERNAL',
    'WAITING_EXTERNAL',
    'ESCALATED',
    'RESOLVED',
    'CANCELLED',
  ],
  WAITING_CUSTOMER: ['IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CANCELLED'],
  WAITING_INTERNAL: ['IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CANCELLED'],
  WAITING_EXTERNAL: ['IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CANCELLED'],
  ESCALATED: ['IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_INTERNAL', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS', 'OPEN'],
  CLOSED: ['OPEN'],
  CANCELLED: ['OPEN'],
};

export function canTransitionTicket(from: SupportTicketStatus, to: SupportTicketStatus) {
  return transitions[from].includes(to);
}

export function addBusinessHours(
  start: Date,
  hours: number,
  weekdays: number[] = [1, 2, 3, 4, 5],
  holidays: string[] = [],
  startHour = 9,
  endHour = 17,
) {
  if (
    !Number.isFinite(hours) ||
    hours <= 0 ||
    startHour < 0 ||
    endHour > 24 ||
    startHour >= endHour
  )
    throw new Error('Duração ou calendário SLA inválido.');
  const result = new Date(start);
  let remaining = Math.ceil(hours * 60);
  while (remaining > 0) {
    result.setUTCMinutes(result.getUTCMinutes() + 1);
    const date = result.toISOString().slice(0, 10);
    if (
      weekdays.includes(result.getUTCDay()) &&
      !holidays.includes(date) &&
      result.getUTCHours() >= startHour &&
      result.getUTCHours() < endHour
    )
      remaining -= 1;
  }
  return result;
}

export function ticketNumber(sequence: number, year = new Date().getUTCFullYear()) {
  return `SUP-${year}-${String(sequence).padStart(6, '0')}`;
}
