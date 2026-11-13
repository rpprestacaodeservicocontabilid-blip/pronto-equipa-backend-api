export interface PasswordResetTokenProps {
  id: number;

  authAccountId: number;

  token: string;

  expiresAt: Date;

  createdAt: Date;

  usedAt: Date | null;
}

export class PasswordResetToken {
  private readonly _id: number;

  private readonly _authAccountId: number;

  private readonly _token: string;

  private readonly _expiresAt: Date;

  private readonly _createdAt: Date;

  private _usedAt: Date | null;

  private constructor(
    props: PasswordResetTokenProps,
  ) {
    this._id = props.id;
    this._authAccountId =
      props.authAccountId;
    this._token = props.token;
    this._expiresAt = props.expiresAt;
    this._createdAt = props.createdAt;
    this._usedAt = props.usedAt;
  }

  public static create(
    props: PasswordResetTokenProps,
  ): PasswordResetToken {
    if (props.authAccountId <= 0) {
      throw new Error(
        "Auth account ID must be greater than zero.",
      );
    }

    if (!props.token?.trim()) {
      throw new Error(
        "Password reset token is required.",
      );
    }

    if (
      props.expiresAt <= props.createdAt
    ) {
      throw new Error(
        "Password reset token expiration must be after creation.",
      );
    }

    return new PasswordResetToken(
      props,
    );
  }

  public use(): void {
    if (!this.isValid()) {
      throw new Error(
        "Password reset token is no longer valid.",
      );
    }

    this._usedAt = new Date();
  }

  public isUsed(): boolean {
    return this._usedAt !== null;
  }

  public isExpired(
    now: Date = new Date(),
  ): boolean {
    return this._expiresAt <= now;
  }

  public isValid(
    now: Date = new Date(),
  ): boolean {
    return (
      !this.isUsed() &&
      !this.isExpired(now)
    );
  }

  public get id(): number {
    return this._id;
  }

  public get authAccountId(): number {
    return this._authAccountId;
  }

  public get token(): string {
    return this._token;
  }

  public get expiresAt(): Date {
    return this._expiresAt;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get usedAt(): Date | null {
    return this._usedAt;
  }
}