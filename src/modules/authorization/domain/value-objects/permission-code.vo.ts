export class PermissionCode {
  private constructor(readonly value: string) {}

  static create(value: string): PermissionCode {
    const normalized = value.trim().toLowerCase();

    if (normalized.length > 150 || !/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/.test(normalized)) {
      throw new Error('Invalid permission code.');
    }

    return new PermissionCode(normalized);
  }

  get resource(): string {
    return this.value.slice(0, this.value.lastIndexOf('.'));
  }

  get operation(): string {
    return this.value.slice(this.value.lastIndexOf('.') + 1);
  }

  equals(other: PermissionCode): boolean {
    return this.value === other.value;
  }
}
