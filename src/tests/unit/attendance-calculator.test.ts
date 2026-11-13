import { AttendanceCalculator } from '../../modules/attendance/domain/services/attendance-calculator.service';

const punch = (id: string, punchType: 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END', at: string) => ({
  id,
  punchType,
  occurredAt: new Date(at),
});

describe('AttendanceCalculator', () => {
  const calculator = new AttendanceCalculator();

  it('calculates work and deducts recorded breaks', () => {
    const result = calculator.calculate(
      [
        punch('in', 'IN', '2026-03-02T08:00:00Z'),
        punch('break-start', 'BREAK_START', '2026-03-02T12:00:00Z'),
        punch('break-end', 'BREAK_END', '2026-03-02T12:30:00Z'),
        punch('out', 'OUT', '2026-03-02T16:00:00Z'),
      ],
      {
        startAt: new Date('2026-03-02T08:00:00Z'),
        endAt: new Date('2026-03-02T16:00:00Z'),
        breakMinutes: 30,
      },
      { lateMinutes: 0, earlyDepartureMinutes: 0, version: 1 },
    );

    expect(result.workedMinutes).toBe(450);
    expect(result.expectedMinutes).toBe(450);
    expect(result.status).toBe('PRESENT');
    expect(result.occurrences).toHaveLength(0);
  });

  it('records an unclassified absence instead of asserting an unjustified absence', () => {
    const result = calculator.calculate(
      [],
      {
        startAt: new Date('2026-03-02T08:00:00Z'),
        endAt: new Date('2026-03-02T16:00:00Z'),
        breakMinutes: 30,
      },
      { lateMinutes: 5, earlyDepartureMinutes: 5, version: 2 },
    );

    expect(result.status).toBe('ABSENT');
    expect(result.occurrences).toContainEqual(
      expect.objectContaining({ type: 'ABSENCE_UNCLASSIFIED', status: 'PENDING' }),
    );
  });

  it('handles overnight shifts and incomplete punches', () => {
    const result = calculator.calculate(
      [punch('in', 'IN', '2026-03-02T21:00:00Z')],
      {
        startAt: new Date('2026-03-02T21:00:00Z'),
        endAt: new Date('2026-03-03T05:00:00Z'),
        breakMinutes: 0,
      },
      { lateMinutes: 0, earlyDepartureMinutes: 0, version: 1 },
    );

    expect(result.status).toBe('INCOMPLETE');
    expect(result.occurrences).toContainEqual(
      expect.objectContaining({ type: 'MISSING_PUNCH', status: 'PENDING' }),
    );
  });

  it('deducts the configured break when explicit break punches are absent', () => {
    const result = calculator.calculate(
      [punch('in', 'IN', '2026-03-02T08:00:00Z'), punch('out', 'OUT', '2026-03-02T16:00:00Z')],
      {
        startAt: new Date('2026-03-02T08:00:00Z'),
        endAt: new Date('2026-03-02T16:00:00Z'),
        breakMinutes: 30,
      },
      { lateMinutes: 0, earlyDepartureMinutes: 0, version: 1 },
    );

    expect(result.workedMinutes).toBe(450);
  });
});
