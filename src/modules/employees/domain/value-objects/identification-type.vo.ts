const IDENTIFICATION_TYPES = ['BI', 'NIF', 'NISS', 'PASSPORT', 'OTHER'] as const;
export type IdentificationTypeValue = (typeof IDENTIFICATION_TYPES)[number];

export class IdentificationType {
  private constructor(readonly value: IdentificationTypeValue) {}

  static from(value: string): IdentificationType {
    const normalized = value.toUpperCase() as IdentificationTypeValue;
    if (!IDENTIFICATION_TYPES.includes(normalized)) {
      throw new Error(`Invalid identification type: ${value}.`);
    }
    return new IdentificationType(normalized);
  }
}
