import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
} from "sequelize";

import { sequelize } from "../../../../../infra/database";


export class AuthAccountModel extends Model<
    InferAttributes<AuthAccountModel>,
    InferCreationAttributes<AuthAccountModel>
> {

    declare id: CreationOptional<number>;

    declare userId: number;

    declare provider: string;

    declare providerAccountId: string | null;

    declare email: string;

    declare passwordHash: string | null;

    declare status: string;

    declare emailVerifiedAt: Date | null;

    declare failedLoginAttempts: CreationOptional<number>;

    declare lockedUntil: Date | null;

    declare lastLoginAt: Date | null;

    declare createdAt: CreationOptional<Date>;

    declare updatedAt: CreationOptional<Date>;
}


AuthAccountModel.init(
    {

        id: {

            type: DataTypes.INTEGER,

            autoIncrement: true,

            primaryKey: true,
        },


        userId: {

            type: DataTypes.INTEGER,

            allowNull: false,
        },


        provider: {

            type: DataTypes.STRING(30),

            allowNull: false,
        },


        providerAccountId: {

            type: DataTypes.STRING(255),

            allowNull: true,
        },


        email: {

            type: DataTypes.STRING(255),

            allowNull: false,

        },


        passwordHash: {

            type: DataTypes.STRING(255),

            allowNull: true,
        },


        status: {

            type: DataTypes.STRING(30),

            allowNull: false,
        },


        emailVerifiedAt: {

            type: DataTypes.DATE,

            allowNull: true,
        },


        failedLoginAttempts: {

            type: DataTypes.INTEGER,

            allowNull: false,

            defaultValue: 0,
        },


        lockedUntil: {

            type: DataTypes.DATE,

            allowNull: true,
        },


        lastLoginAt: {

            type: DataTypes.DATE,

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

        tableName: "auth_accounts",

        timestamps: true,

        indexes: [

            {
                unique: true,

                fields: [
                    "provider",
                    "providerAccountId",
                ],
            },

            {
                unique: true,

                fields: [
                    "email",
                ],
            },

            {
                fields: [
                    "userId",
                ],
            },

        ],
    },
);