export const ATTENDANCE_ENTITY_TYPES = [
  'DAY',
  'OCCURRENCE',
  'JUSTIFICATION',
  'DECISION',
  'CORRECTION',
  'PERIOD',
  'SNAPSHOT',
  'POLICY',
  'IMPORT_BATCH',
  'IMPORT_ITEM',
  'DEVICE',
  'RECTIFICATION',
] as const;

export type AttendanceEntityType = (typeof ATTENDANCE_ENTITY_TYPES)[number];
