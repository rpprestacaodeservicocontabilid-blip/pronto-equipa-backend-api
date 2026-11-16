import { Permission } from './permission.entity';

export interface RoleProps {
  id: number;
  name: string;
  description: string | null;
  system: boolean;
  active: boolean;
  permissions?: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

export class Role {
  private readonly _id: number;

  private _name: string;
  private _description: string | null;

  private readonly _system: boolean;

  private _active: boolean;

  private readonly _permissions: Permission[];

  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: RoleProps) {
    if (props.id <= 0) {
      throw new Error('Role ID must be greater than zero.');
    }

    if (!props.name?.trim()) {
      throw new Error('Role name is required.');
    }

    this._id = props.id;
    this._name = props.name.trim();
    this._description = props.description?.trim() || null;

    this._system = props.system;
    this._active = props.active;

    this._permissions = [...(props.permissions ?? [])];

    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(props: RoleProps): Role {
    return new Role(props);
  }

  public rename(name: string): void {
    if (this._system) {
      throw new Error('System roles cannot be renamed.');
    }

    if (!name?.trim()) {
      throw new Error('Role name is required.');
    }

    this._name = name.trim();
    this.touch();
  }

  public activate(): void {
    this._active = true;
    this.touch();
  }

  public deactivate(): void {
    if (this._system) {
      throw new Error('System roles cannot be deactivated.');
    }

    this._active = false;
    this.touch();
  }

  public addPermission(permission: Permission): void {
    const exists = this._permissions.some((current) => current.id === permission.id);

    if (!exists) {
      this._permissions.push(permission);
      this.touch();
    }
  }

  public removePermission(permissionId: number): void {
    const index = this._permissions.findIndex((permission) => permission.id === permissionId);

    if (index >= 0) {
      this._permissions.splice(index, 1);
      this.touch();
    }
  }

  private touch(): void {
    this._updatedAt = new Date();
  }

  public get id(): number {
    return this._id;
  }

  public get name(): string {
    return this._name;
  }

  public get description(): string | null {
    return this._description;
  }

  public get system(): boolean {
    return this._system;
  }

  public get active(): boolean {
    return this._active;
  }

  public get permissions(): readonly Permission[] {
    return [...this._permissions];
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public toPrimitives(): {
    id: number;
    name: string;
    description: string | null;
    system: boolean;
    active: boolean;
    permissions: Array<{ id: number; name: string }>;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      id: this._id,
      name: this._name,
      description: this._description,
      system: this._system,
      active: this._active,
      permissions: this._permissions.map((p) => ({ id: p.id, name: p.name })),
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }

  public static reconstitute(props: RoleProps): Role {
    return new Role(props);
  }
}
