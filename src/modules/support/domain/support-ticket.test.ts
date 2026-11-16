import { addBusinessHours, canTransitionTicket, ticketNumber } from './support-ticket';

describe('Support ticket domain policies', () => {
  it('only accepts configured lifecycle transitions', () => {
    expect(canTransitionTicket('OPEN', 'ASSIGNED')).toBe(true);
    expect(canTransitionTicket('CLOSED', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionTicket('CLOSED', 'OPEN')).toBe(true);
  });

  it('creates stable public ticket numbers', () => {
    expect(ticketNumber(8, 2026)).toBe('SUP-2026-000008');
  });

  it('calculates business-hour deadlines without counting weekends', () => {
    const friday = new Date('2026-11-13T16:00:00.000Z');
    expect(addBusinessHours(friday, 16).toISOString()).toBe('2026-11-17T16:00:00.000Z');
  });
});
