import { AuthAccountId } from '../value-objects/auth-account-id.vo';
import { Email } from '../value-objects/email.vo';
import { Password } from '../value-objects/password.vo';

import { AuthProvider } from '../enums/auth-provider.enum';
import { AuthStatus } from '../enums/auth-status.enum';
import { Role } from '../enums/role.enum';

export interface AuthAccountProps {
  id: AuthAccountId;

  userId: number;

  email: Email;

  password: Password | null;

  provider: AuthProvider;

  providerAccountId: string | null;

  status: AuthStatus;

  roles: Role[];

  emailVerifiedAt: Date | null;

  failedLoginAttempts: number;

  lockedUntil: Date | null;

  lastLoginAt: Date | null;

  createdAt: Date;

  updatedAt: Date;
}

export interface AuthAccountPersistence {
  id: number;

  userId: number;

  email: string;

  password: string | null;

  provider: AuthProvider;

  providerAccountId: string | null;

  status: AuthStatus;

  emailVerifiedAt: Date | null;

  failedLoginAttempts: number;

  lockedUntil: Date | null;

  lastLoginAt: Date | null;

  createdAt: Date;

  updatedAt: Date;
}

export class AuthAccount {
  private readonly _id: AuthAccountId;

  private readonly _userId: number;

  private _email: Email;

  private _password: Password | null;

  private _provider: AuthProvider;

  private _providerAccountId: string | null;

  private _status: AuthStatus;

  private readonly _roles: Role[];

  private _emailVerifiedAt: Date | null;

  private _failedLoginAttempts: number;

  private _lockedUntil: Date | null;

  private _lastLoginAt: Date | null;

  private readonly _createdAt: Date;

  private _updatedAt: Date;

  private constructor(props: AuthAccountProps) {
    this._id = props.id;

    this._userId = props.userId;

    this._email = props.email;

    this._password = props.password;

    this._provider = props.provider;

    this._providerAccountId = props.providerAccountId;

    this._status = props.status;

    this._roles = [...new Set(props.roles)];

    this._emailVerifiedAt = props.emailVerifiedAt;

    this._failedLoginAttempts = props.failedLoginAttempts;

    this._lockedUntil = props.lockedUntil;

    this._lastLoginAt = props.lastLoginAt;

    this._createdAt = props.createdAt;

    this._updatedAt = props.updatedAt;
  }

  /**
   * Cria uma nova conta de autenticação.
   *
   * Usado quando a conta ainda está a ser criada
   * pela aplicação.
   */
  public static create(props: AuthAccountProps): AuthAccount {
    if (props.userId <= 0) {
      throw new Error('User ID must be greater than zero.');
    }

    if (props.provider === AuthProvider.LOCAL && !props.password) {
      throw new Error('Local authentication requires a password.');
    }

    if (props.provider === AuthProvider.GOOGLE && !props.providerAccountId) {
      throw new Error('Google authentication requires a provider account ID.');
    }

    return new AuthAccount(props);
  }

  /**
   * Reconstitui uma entidade existente
   * a partir dos dados persistidos.
   *
   * Usado pelos repositories.
   */
  public static reconstitute(props: AuthAccountProps): AuthAccount {
    return new AuthAccount(props);
  }

  /**
   * Converte a entidade para o formato
   * utilizado pela persistência.
   */
  public toPersistence(): AuthAccountPersistence {
    return {
      id: this._id.getValue(),

      userId: this._userId,

      email: this._email.getValue(),

      password: this._password ? this._password.getValue() : null,

      provider: this._provider,

      providerAccountId: this._providerAccountId,

      status: this._status,

      emailVerifiedAt: this._emailVerifiedAt,

      failedLoginAttempts: this._failedLoginAttempts,

      lockedUntil: this._lockedUntil,

      lastLoginAt: this._lastLoginAt,

      createdAt: this._createdAt,

      updatedAt: this._updatedAt,
    };
  }

  public verifyEmail(): void {
    this._emailVerifiedAt = new Date();

    if (this._status === AuthStatus.PENDING_VERIFICATION) {
      this._status = AuthStatus.ACTIVE;
    }

    this.touch();
  }

  public changePassword(password: Password): void {
    this._password = password;

    this.touch();
  }

  public recordSuccessfulLogin(): void {
    this._failedLoginAttempts = 0;

    this._lockedUntil = null;

    this._lastLoginAt = new Date();

    this.touch();
  }

  public recordFailedLogin(): void {
    this._failedLoginAttempts++;

    this.touch();
  }

  public lock(until: Date | null = null): void {
    this._status = AuthStatus.LOCKED;

    this._lockedUntil = until;

    this.touch();
  }

  public unlock(): void {
    this._status = AuthStatus.ACTIVE;

    this._failedLoginAttempts = 0;

    this._lockedUntil = null;

    this.touch();
  }

  public suspend(): void {
    this._status = AuthStatus.SUSPENDED;

    this.touch();
  }

  public disable(): void {
    this._status = AuthStatus.DISABLED;

    this.touch();
  }

  public activate(): void {
    this._status = AuthStatus.ACTIVE;

    this.touch();
  }

  public assignRole(role: Role): void {
    if (!this._roles.includes(role)) {
      this._roles.push(role);

      this.touch();
    }
  }

  public removeRole(role: Role): void {
    const index = this._roles.indexOf(role);

    if (index >= 0) {
      this._roles.splice(index, 1);

      this.touch();
    }
  }

  public isLocked(now: Date = new Date()): boolean {
    if (this._status !== AuthStatus.LOCKED) {
      return false;
    }

    if (this._lockedUntil && this._lockedUntil <= now) {
      return false;
    }

    return true;
  }

  public canAuthenticate(now: Date = new Date()): boolean {
    if (this._status === AuthStatus.DISABLED || this._status === AuthStatus.SUSPENDED) {
      return false;
    }

    if (this.isLocked(now)) {
      return false;
    }

    return true;
  }

  private touch(): void {
    this._updatedAt = new Date();
  }

  public get id(): AuthAccountId {
    return this._id;
  }

  public get userId(): number {
    return this._userId;
  }

  public get email(): Email {
    return this._email;
  }

  public get password(): Password | null {
    return this._password;
  }

  public get provider(): AuthProvider {
    return this._provider;
  }

  public get providerAccountId(): string | null {
    return this._providerAccountId;
  }

  public get status(): AuthStatus {
    return this._status;
  }

  public get roles(): readonly Role[] {
    return [...this._roles];
  }

  public get emailVerifiedAt(): Date | null {
    return this._emailVerifiedAt;
  }

  public get failedLoginAttempts(): number {
    return this._failedLoginAttempts;
  }

  public get lockedUntil(): Date | null {
    return this._lockedUntil;
  }

  public get lastLoginAt(): Date | null {
    return this._lastLoginAt;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }
}
