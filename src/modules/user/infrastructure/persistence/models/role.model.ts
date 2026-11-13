import {
    DataTypes,
    Model,
    Optional,
} from "sequelize";

import { sequelize } from "../../../../../infra/database";

export interface RoleModelAttributes {
    id: number;

    name: string;
    description: string | null;

    isSystem: boolean;

    /**
     * Empresa (tenant) a que a role pertence.
     * `null` = role global do sistema (ex.: ADMIN, SUPER_ADMIN).
     */
    companyId: number | null;

    createdAt: Date;
    updatedAt: Date;
}

export interface RoleCreationAttributes
    extends Optional<
        RoleModelAttributes,
        | "id"
        | "description"
        | "isSystem"
        | "companyId"
        | "createdAt"
        | "updatedAt"
    > { }

export class RoleModel
    extends Model<
        RoleModelAttributes,
        RoleCreationAttributes
    >
    implements RoleModelAttributes {
    declare id: number;

    declare name: string;
    declare description: string | null;

    declare isSystem: boolean;

    declare companyId: number | null;

    declare createdAt: Date;
    declare updatedAt: Date;
}

RoleModel.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },

        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },

        description: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },

        isSystem: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },

        companyId: {
            type: DataTypes.INTEGER,
            allowNull: true,
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
        tableName: "roles",
        modelName: "Role",
        timestamps: true,

        indexes: [
            {
                unique: true,
                fields: ["companyId", "name"],
            },
            {
                fields: ["companyId"],
            },
        ],
    },
);
