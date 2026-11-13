import { ValidationError } from '../../../../shared/errors/app.error';

export class AttendanceDuration {
  private constructor(readonly minutes: number) {}

  static fromMinutes(minutes: number): AttendanceDuration {
    if (!Number.isSafeInteger(minutes) || minutes < 0) {
      throw new ValidationError(
        'Attendance duration must be a non-negative integer number of minutes.',
      );
    }
    return new AttendanceDuration(minutes);
  }
}
