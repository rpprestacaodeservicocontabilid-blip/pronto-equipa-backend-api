/**
 * Estados de um pedido de férias e máquina de transições
 * (secção 5 da especificação).
 */

export const LEAVE_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'RETURNED',
  'APPROVED',
  'REJECTED',
  'IN_PROGRESS',
  'PARTIALLY_COMPLETED',
  'INTERRUPTED',
  'COMPLETED',
  'CANCELLED',
] as const;

export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/** Transições permitidas por estado de origem. */
export const LEAVE_TRANSITIONS: Record<LeaveStatus, LeaveStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED'],
  RETURNED: ['PENDING_APPROVAL', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'INTERRUPTED', 'PARTIALLY_COMPLETED'],
  PARTIALLY_COMPLETED: ['COMPLETED'],
  INTERRUPTED: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

/** Estados que encerram o ciclo de vida do pedido. */
export const TERMINAL_LEAVE_STATUSES: readonly LeaveStatus[] = [
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
];

/**
 * Estados em que existe uma reserva de saldo ACTIVA (o movimento
 * RESERVATION ainda não foi libertado por RELEASE).
 */
export const RESERVED_LEAVE_STATUSES: readonly LeaveStatus[] = [
  'APPROVED',
  'IN_PROGRESS',
  'INTERRUPTED',
];

/**
 * Estados que bloqueiam a criação de novos pedidos sobrepostos
 * para o mesmo trabalhador (RN-017).
 */
export const BLOCKING_LEAVE_STATUSES: readonly LeaveStatus[] = [
  'PENDING_APPROVAL',
  'APPROVED',
  'IN_PROGRESS',
  'PARTIALLY_COMPLETED',
  'INTERRUPTED',
  'COMPLETED',
];

/** Estados a partir dos quais o saldo está reservado e por reconciliar. */
export const RECONCILABLE_LEAVE_STATUSES: readonly LeaveStatus[] = [
  'APPROVED',
  'IN_PROGRESS',
  'INTERRUPTED',
];

export const isLeaveStatus = (value: unknown): value is LeaveStatus =>
  typeof value === 'string' && (LEAVE_STATUSES as readonly string[]).includes(value);

export const canTransitionLeave = (from: LeaveStatus, to: LeaveStatus): boolean =>
  LEAVE_TRANSITIONS[from]?.includes(to) ?? false;
