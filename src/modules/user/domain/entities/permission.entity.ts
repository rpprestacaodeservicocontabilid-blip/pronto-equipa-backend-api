import { PermissionScope } from "../enums/permission-scope.enum";

export interface PermissionProps {
    id: number;
    name: string;
    description: string | null;
    resource: string;
    action: string;
    scope: PermissionScope;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export class Permission {
    private readonly _id: number;

    private _name: string;
    private _description: string | null;

    private readonly _resource: string;
    private readonly _action: string;
    private readonly _scope: PermissionScope;

    private _active: boolean;

    private readonly _createdAt: Date;
    private _updatedAt: Date;

    private constructor(
        props: PermissionProps,
    ) {
        if (props.id <= 0) {
            throw new Error(
                "Permission ID must be greater than zero.",
            );
        }

        if (!props.name?.trim()) {
            throw new Error(
                "Permission name is required.",
            );
        }

        if (!props.resource?.trim()) {
            throw new Error(
                "Permission resource is required.",
            );
        }

        if (!props.action?.trim()) {
            throw new Error(
                "Permission action is required.",
            );
        }

        this._id = props.id;
        this._name = props.name.trim();
        this._description =
            props.description?.trim() || null;

        this._resource = props.resource.trim();
        this._action = props.action.trim();
        this._scope = props.scope;

        this._active = props.active;

        this._createdAt = props.createdAt;
        this._updatedAt = props.updatedAt;
    }

    public static create(
        props: PermissionProps,
    ): Permission {
        return new Permission(props);
    }

    public activate(): void {
        this._active = true;
        this.touch();
    }

    public deactivate(): void {
        this._active = false;
        this.touch();
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

    public get resource(): string {
        return this._resource;
    }

    public get action(): string {
        return this._action;
    }

    public get scope(): PermissionScope {
        return this._scope;
    }

    public get active(): boolean {
        return this._active;
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
        resource: string;
        action: string;
        scope: string;
        active: boolean;
        createdAt: Date;
        updatedAt: Date;
    } {
        return {
            id: this._id,
            name: this._name,
            description: this._description,
            resource: this._resource,
            action: this._action,
            scope: this._scope,
            active: this._active,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
        };
    }

    public static reconstitute(
        props: PermissionProps,
    ): Permission {
        return new Permission(props);
    }
}