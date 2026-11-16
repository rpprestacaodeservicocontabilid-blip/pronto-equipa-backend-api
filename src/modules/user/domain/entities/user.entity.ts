import { UserStatus } from '../enums/user-status.enum';
import { UserType } from '../enums/user-type.enum';
import { Email } from '../value-objects/email.vo';
import { UserId } from '../value-objects/user-id.vo';
import { UserName } from '../value-objects/user-name.vo';
import { Phone } from '../value-objects/phone.vo';
import { DomainEvent } from '../events/event-publisher.port';
import { Role } from './role.entity';

export interface UserProps {
  id: UserId;
  name: UserName;
  email: Email;
  phone: Phone | null;
  type: UserType;
  status: UserStatus;
  profileId: number | null;
  roles?: Role[];
  emailVerifiedAt: Date | null;
  termsAcceptedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterUserProps {
  name: string;
  email: string;
  phone?: string | null;
  termsAcceptedAt?: Date | null;
  type?: UserType;
}

export class User {
  private readonly _id: UserId;
  private _name: UserName;
  private _email: Email;
  private _phone: Phone | null;
  private _type: UserType;
  private _status: UserStatus;
  private _profileId: number | null;
  private readonly _roles: Role[];
  private _emailVerifiedAt: Date | null;
  private _termsAcceptedAt: Date | null;
  private _lastLoginAt: Date | null;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: UserProps) {
    this._id = props.id;
    this._name = props.name;
    this._email = props.email;
    this._phone = props.phone ?? null;
    this._type = props.type;
    this._status = props.status;
    this._profileId = props.profileId;

    this._roles = [...(props.roles ?? [])];

    this._emailVerifiedAt = props.emailVerifiedAt;

    this._termsAcceptedAt = props.termsAcceptedAt ?? null;

    this._lastLoginAt = props.lastLoginAt;

    this._createdAt = props.createdAt;

    this._updatedAt = props.updatedAt;
  }

  /**
   * Criação completa do agregado.
   *
   * Usado principalmente quando todos os dados
   * da entidade já estão disponíveis.
   */
  public static create(props: UserProps): User {
    if (!props.id) {
      throw new Error('User ID is required.');
    }

    if (!props.name) {
      throw new Error('User name is required.');
    }

    if (!props.email) {
      throw new Error('User email is required.');
    }

    return new User(props);
  }

  /**
   * Cria um novo utilizador a partir do processo
   * normal de registo.
   *
   * O ID será gerado pelo banco de dados/repositório.
   */
  public static register(props: RegisterUserProps): User {
    const name = UserName.create(props.name);

    const email = Email.create(props.email);

    const now = new Date();

    return new User({
      id: UserId.create(0),
      name,
      email,
      phone: props.phone ? Phone.create(props.phone) : null,
      type: props.type ?? UserType.PLAYER,
      status: UserStatus.ACTIVE,
      profileId: null,
      roles: [],
      emailVerifiedAt: null,
      termsAcceptedAt: props.termsAcceptedAt ?? null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  public changeName(name: string | UserName): void {
    this._name = name instanceof UserName ? name : UserName.create(name);

    this.touch();
  }

  public changePhone(phone: string | null): void {
    if (phone !== null && !phone.trim()) {
      throw new Error('Phone cannot be empty.');
    }

    this._phone = phone ? Phone.create(phone) : null;

    this.touch();
  }

  public changeEmail(email: string | Email): void {
    this._email = email instanceof Email ? email : Email.create(email);

    this._emailVerifiedAt = null;

    this.touch();
  }

  public updateName(name: UserName): void {
    this._name = name;
    this.touch();
  }

  public updateEmail(email: Email): void {
    this._email = email;
    this._emailVerifiedAt = null;

    this.touch();
  }

  public changeType(type: UserType): void {
    this._type = type;
    this.touch();
  }

  public assignProfile(profileId: number): void {
    if (profileId <= 0) {
      throw new Error('Profile ID must be greater than zero.');
    }

    this._profileId = profileId;

    this.touch();
  }

  public removeProfile(): void {
    this._profileId = null;
    this.touch();
  }

  public assignRole(role: Role): void {
    if (!role.active) {
      throw new Error('Cannot assign an inactive role.');
    }

    const exists = this._roles.some((currentRole) => currentRole.id === role.id);

    if (!exists) {
      this._roles.push(role);
      this.touch();
    }
  }

  public removeRole(roleId: number): void {
    const index = this._roles.findIndex((role) => role.id === roleId);

    if (index >= 0) {
      this._roles.splice(index, 1);
      this.touch();
    }
  }

  public activate(): void {
    if (this._status === UserStatus.DELETED) {
      throw new Error('Deleted users cannot be activated.');
    }

    this._status = UserStatus.ACTIVE;

    this.touch();
  }

  public deactivate(_reason?: string): void {
    if (this._status === UserStatus.DELETED) {
      throw new Error('Deleted users cannot be deactivated.');
    }

    this._status = UserStatus.INACTIVE;

    this.touch();
  }

  public suspend(): void {
    if (this._status === UserStatus.DELETED) {
      throw new Error('Deleted users cannot be suspended.');
    }

    this._status = UserStatus.SUSPENDED;

    this.touch();
  }

  public block(): void {
    if (this._status === UserStatus.DELETED) {
      throw new Error('Deleted users cannot be blocked.');
    }

    this._status = UserStatus.BLOCKED;

    this.touch();
  }

  public markEmailAsVerified(date: Date = new Date()): void {
    this._emailVerifiedAt = date;
    this.touch();
  }

  public recordLogin(date: Date = new Date()): void {
    this._lastLoginAt = date;
    this.touch();
  }

  private touch(): void {
    this._updatedAt = new Date();
  }

  public get id(): UserId {
    return this._id;
  }

  public get name(): UserName {
    return this._name;
  }

  public get email(): Email {
    return this._email;
  }

  public get phone(): Phone | null {
    return this._phone;
  }

  public get type(): UserType {
    return this._type;
  }

  public get status(): UserStatus {
    return this._status;
  }

  public get profileId(): number | null {
    return this._profileId;
  }

  public get roles(): readonly Role[] {
    return [...this._roles];
  }

  public get emailVerifiedAt(): Date | null {
    return this._emailVerifiedAt;
  }

  public get termsAcceptedAt(): Date | null {
    return this._termsAcceptedAt;
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

  public isActive(): boolean {
    return this._status === UserStatus.ACTIVE;
  }

  public get isDeleted(): boolean {
    return this._status === UserStatus.DELETED;
  }

  public get isEmailVerified(): boolean {
    return this._emailVerifiedAt !== null;
  }

  public hasRole(roleName: string): boolean {
    return this._roles.some((role) => role.name.toLowerCase() === roleName.toLowerCase());
  }

  public hasPermission(permissionName: string, resource?: string): boolean {
    if (this._roles.some((role) => ['ADMIN', 'SUPER_ADMIN'].includes(role.name.toUpperCase()))) {
      return true;
    }

    return this._roles.some((role) =>
      role.permissions.some(
        (permission) =>
          permission.name.toLowerCase() === permissionName.toLowerCase() &&
          (!resource || permission.resource.toLowerCase() === resource.toLowerCase()),
      ),
    );
  }

  public assignPermission(
    permission: {
      id: number;
      name: string;
      resource: string;
      active: boolean;
    },
    _assignedBy?: number | null,
  ): void {
    if (!permission || !permission.active) {
      throw new Error('Cannot assign inactive permission.');
    }

    this._roles.forEach((role) => {
      if (role.permissions.some((current) => current.id === permission.id)) {
        return;
      }

      role.addPermission(permission as any);
    });

    this.touch();
  }

  public removePermission(permission: { id: number }): void {
    this._roles.forEach((role) => {
      role.removePermission(permission.id);
    });

    this.touch();
  }

  public pullDomainEvents(): DomainEvent[] {
    return [];
  }

  public toPrimitives(): Record<string, any> {
    return {
      id: this._id.getValue(),
      name: this._name.getValue(),
      email: this._email.getValue(),
      phone: this._phone ? this._phone.getValue() : null,
      type: this._type,
      status: this._status,
      profileId: this._profileId,

      roles: this._roles.map((role) =>
        typeof role.toPrimitives === 'function' ? role.toPrimitives() : role,
      ),

      emailVerifiedAt: this._emailVerifiedAt,

      termsAcceptedAt: this._termsAcceptedAt,

      lastLoginAt: this._lastLoginAt,

      createdAt: this._createdAt,

      updatedAt: this._updatedAt,
    };
  }

  public toPersistence(): Record<string, any> {
    return {
      id: this._id.getValue(),
      name: this._name.getValue(),
      email: this._email.getValue(),
      phone: this._phone ? this._phone.getValue() : null,
      type: this._type,
      status: this._status,
      profileId: this._profileId,
      emailVerifiedAt: this._emailVerifiedAt,
      termsAcceptedAt: this._termsAcceptedAt,
      lastLoginAt: this._lastLoginAt,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }

  public static reconstitute(props: UserProps): User {
    return new User(props);
  }
}
