import { SessionId } from "../value-objects/session-id.vo";
import { SessionStatus } from "../enums/session-status.enum";

export interface SessionProps {
  id: SessionId;

  authAccountId: number;

  userId: number;

  status: SessionStatus;

  ipAddress: string | null;

  userAgent: string | null;

  deviceId: string | null;

  expiresAt: Date;

  createdAt: Date;

  revokedAt: Date | null;
}

export class Session {
  private readonly _id: SessionId;

  private readonly _authAccountId: number;

  private readonly _userId: number;

  private _status: SessionStatus;

  private readonly _ipAddress: string | null;

  private readonly _userAgent: string | null;

  private readonly _deviceId: string | null;

  private readonly _expiresAt: Date;

  private readonly _createdAt: Date;

  private _revokedAt: Date | null;

  private constructor(
    props: SessionProps,
  ) {
    this._id = props.id;
    this._authAccountId =
      props.authAccountId;
    this._userId = props.userId;
    this._status = props.status;
    this._ipAddress = props.ipAddress;
    this._userAgent = props.userAgent;
    this._deviceId = props.deviceId;
    this._expiresAt = props.expiresAt;
    this._createdAt = props.createdAt;
    this._revokedAt = props.revokedAt;
  }

  public static create(
    props: SessionProps,
  ): Session {
    if (props.authAccountId <= 0) {
      throw new Error(
        "Auth account ID must be greater than zero.",
      );
    }

    if (props.userId <= 0) {
      throw new Error(
        "User ID must be greater than zero.",
      );
    }

    if (
      props.expiresAt <= props.createdAt
    ) {
      throw new Error(
        "Session expiration must be after creation.",
      );
    }

    return new Session(props);
  }

  public revoke(): void {
    if (
      this._status ===
      SessionStatus.REVOKED
    ) {
      return;
    }

    this._status =
      SessionStatus.REVOKED;

    this._revokedAt = new Date();
  }

  public expire(): void {
    this._status =
      SessionStatus.EXPIRED;
  }

  public isActive(
    now: Date = new Date(),
  ): boolean {
    if (
      this._status !==
      SessionStatus.ACTIVE
    ) {
      return false;
    }

    return this._expiresAt > now;
  }

  public get id(): SessionId {
    return this._id;
  }

  public get authAccountId(): number {
    return this._authAccountId;
  }

  public get userId(): number {
    return this._userId;
  }

  public get status(): SessionStatus {
    return this._status;
  }

  public get ipAddress(): string | null {
    return this._ipAddress;
  }

  public get userAgent(): string | null {
    return this._userAgent;
  }

  public get deviceId(): string | null {
    return this._deviceId;
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