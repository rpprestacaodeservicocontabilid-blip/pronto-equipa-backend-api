import {
    DataTypes,
    Model,
} from "sequelize";

import { sequelize } from "../../../../../infra/database";

export interface RolePermissionModelAttributes {
    roleId: number;
    permissionId: number;

    createdAt: Date;
}

export class RolePermissionModel
    extends Model<RolePermissionModelAttributes>
    implements RolePermissionModelAttributes {
    declare roleId: number;
    declare permissionId: number;

    declare createdAt: Date;
}

RolePermissionModel.init(
    {
        roleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
        },

        permissionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
        },

        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
    },
    {
        sequelize,
        tableName: "role_permissions",
        modelName: "RolePermission",
        timestamps: false,

        indexes: [
            {
                fields: ["roleId"],
            },
            {
                fields: ["permissionId"],
            },
        ],
    },
);