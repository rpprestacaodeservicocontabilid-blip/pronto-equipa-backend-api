import {
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
} from "sequelize";

import { sequelize } from "../../../../../infra/database";

export class PermissionModel extends Model<
    InferAttributes<PermissionModel>,
    InferCreationAttributes<PermissionModel>
> {
    declare id: number;

    declare name: string;

    declare resource: string;

    declare action: string;

    declare description: string | null;

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

        resource: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },

        action: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },

        description: {
            type: DataTypes.STRING(255),
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
        tableName: "auth_permissions",
        timestamps: true,
    },
);