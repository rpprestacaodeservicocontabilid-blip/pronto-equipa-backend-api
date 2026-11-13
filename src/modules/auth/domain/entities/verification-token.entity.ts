import { TokenType } from "../enums/token-type.enum";

export interface VerificationTokenProps {
  id: number;

  authAccountId: number;

  token: string;

  type: TokenType;

  expiresAt: Date;

  createdAt: Date;

  usedAt: Date | null;

  attempts?: number;

  channel?: string | null;

  destination?: string | null;
}

export class VerificationToken {
  private readonly _id: number;

  private readonly _authAccountId: number;

  private readonly _token: string;

  private readonly _type: TokenType;

  private readonly _expiresAt: Date;

  private readonly _createdAt: Date;

  private _usedAt: Date | null;

  private _attempts: number;

  private readonly _channel: string | null;

  private readonly _destination: string | null;

  private constructor(
    props: VerificationTokenProps,
  ) {
    this._id = props.id;
    this._authAccountId =
      props.authAccountId;
    this._token = props.token;
    this._type = props.type;
    this._expiresAt = props.expiresAt;
    this._createdAt = props.createdAt;
    this._usedAt = props.usedAt;

    this._attempts = props.attempts ?? 0;

    this._channel = props.channel ?? null;

    this._destination = props.destination ?? null;
  }

  public static create(
    props: VerificationTokenProps,
  ): VerificationToken {
    if (props.authAccountId <= 0) {
      throw new Error(
        "Auth account ID must be greater than zero.",
      );
    }

    if (!props.token?.trim()) {
      throw new Error(
        "Verification token is required.",
      );
    }

    if (
      props.expiresAt <= props.createdAt
    ) {
      throw new Error(
        "Verification token expiration must be after creation.",
      );
    }

    return new VerificationToken(
      props,
    );
  }

  public use(): void {
    if (!this.isValid()) {
      throw new Error(
        "Verification token is no longer valid.",
      );
    }

    this._usedAt = new Date();
  }

  /**
   * Invalida o token mesmo quando este já não
   * é válido (ex.: excesso de tentativas).
   */
  public invalidate(): void {
    this._usedAt = new Date();
  }

  /**
   * Regista uma tentativa falhada de utilização.
   */
  public registerAttempt(): void {
    this._attempts++;
  }

  public hasReachedMaxAttempts(
    maxAttempts: number,
  ): boolean {
    return this._attempts >= maxAttempts;
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

  public get type(): TokenType {
    return this._type;
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

  public get attempts(): number {
    return this._attempts;
  }

  public get channel(): string | null {
    return this._channel;
  }

  public get destination(): string | null {
    return this._destination;
  }
}