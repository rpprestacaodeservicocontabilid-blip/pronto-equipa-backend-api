import {
    DataTypes,
    Model,
    Optional,
} from "sequelize";

import { sequelize } from "../../../../../infra/database";

export interface PermissionModelAttributes {
    id: number;

    name: string;
    description: string | null;

    resource: string;
    action: string;
    scope: string;

    isSystem: boolean;

    createdAt: Date;
    updatedAt: Date;
}

export interface PermissionCreationAttributes
    extends Optional<
        PermissionModelAttributes,
        | "id"
        | "description"
        | "scope"
        | "isSystem"
        | "createdAt"
        | "updatedAt"
    > { }

export class PermissionModel
    extends Model<
        PermissionModelAttributes,
        PermissionCreationAttributes
    >
    implements PermissionModelAttributes {
    declare id: number;

    declare name: string;
    declare description: string | null;

    declare resource: string;
    declare action: string;
    declare scope: string;

    declare isSystem: boolean;

    declare createdAt: Date;
    declare updatedAt: Date;
}

PermissionModel.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },

        name: {
            type: DataTypes.STRING(150),
            allowNull: false,
            unique: true,
        },

        description: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },

        resource: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },

        action: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },

        scope: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: "GLOBAL",
        },

        isSystem: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },

        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },

        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    },
    {
        sequelize,
        tableName: "permissions",
        modelName: "Permission",
        timestamps: true,

        indexes: [
            {
                unique: true,
                fields: ["name"],
            },
            {
                fields: ["resource", "action"],
            },
            {
                fields: ["scope"],
            },
        ],
    },
);