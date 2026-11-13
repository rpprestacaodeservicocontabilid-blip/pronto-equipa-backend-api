import { RefreshTokenValue as RefreshToken } from "../value-objects/refresh-token-value.vo";

export interface RefreshTokenProps {
  id: number;

  token: RefreshToken;

  authAccountId: number;

  sessionId: string;

  expiresAt: Date;

  createdAt: Date;

  revokedAt: Date | null;
}

export class RefreshTokenEntity {
  private readonly _id: number;

  private readonly _token: RefreshToken;

  private readonly _authAccountId: number;

  private readonly _sessionId: string;

  private readonly _expiresAt: Date;

  private readonly _createdAt: Date;

  private _revokedAt: Date | null;

  private constructor(
    props: RefreshTokenProps,
  ) {
    this._id = props.id;
    this._token = props.token;
    this._authAccountId =
      props.authAccountId;
    this._sessionId = props.sessionId;
    this._expiresAt = props.expiresAt;
    this._createdAt = props.createdAt;
    this._revokedAt = props.revokedAt;
  }

  public static create(
    props: RefreshTokenProps,
  ): RefreshTokenEntity {
    if (props.authAccountId <= 0) {
      throw new Error(
        "Auth account ID must be greater than zero.",
      );
    }

    if (!props.sessionId?.trim()) {
      throw new Error(
        "Session ID is required.",
      );
    }

    if (
      props.expiresAt <= props.createdAt
    ) {
      throw new Error(
        "Refresh token expiration must be after creation.",
      );
    }

    return new RefreshTokenEntity(
      props,
    );
  }

  public revoke(): void {
    this._revokedAt = new Date();
  }

  public isRevoked(): boolean {
    return this._revokedAt !== null;
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
      !this.isRevoked() &&
      !this.isExpired(now)
    );
  }

  public get id(): number {
    return this._id;
  }

  public get token(): RefreshToken {
    return this._token;
  }

  public get authAccountId(): number {
    return this._authAccountId;
  }

  public get sessionId(): string {
    return this._sessionId;
  }

  public get expiresAt(): Date {
    return this._expiresAt;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get revokedAt(): Date | null {
    return this._revokedAt;
  }
}