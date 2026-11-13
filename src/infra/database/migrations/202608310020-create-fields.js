"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("fields", {
            // ============================================================
            // PRIMARY KEY
            // ============================================================

            id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
            },

            // ============================================================
            // FIELD INFORMATION
            // ============================================================

            name: {
                type: Sequelize.STRING,
                allowNull: false,
            },

            address: {
                type: Sequelize.STRING,
                allowNull: false,
            },

            cityId: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },

            pricePerHour: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
            },

            // ============================================================
            // AVAILABILITY / STATUS
            // ============================================================

            isAvailable: {
                type: Sequelize.BOOLEAN,
                allowNull: true,
                defaultValue: true,
            },

            isActive: {
                type: Sequelize.BOOLEAN,
                allowNull: true,
                defaultValue: true,
            },

            // ============================================================
            // QUALITY CRITERIA
            // ============================================================

            grassQuality: {
                type: Sequelize.INTEGER,
                allowNull: true,
                defaultValue: 3,
            },

            ballQuality: {
                type: Sequelize.INTEGER,
                allowNull: true,
                defaultValue: 3,
            },

            netsCondition: {
                type: Sequelize.INTEGER,
                allowNull: true,
                defaultValue: 3,
            },

            hasRoof: {
                type: Sequelize.BOOLEAN,
                allowNull: true,
                defaultValue: false,
            },

            hasShowers: {
                type: Sequelize.BOOLEAN,
                allowNull: true,
                defaultValue: false,
            },

            averageRating: {
                type: Sequelize.DECIMAL(3, 2),
                allowNull: true,
                defaultValue: 3,
            },

            // ============================================================
            // TIMESTAMPS
            // ============================================================

            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },

            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },
        });

        // ============================================================
        // INDEXES
        // ============================================================

        await queryInterface.addIndex("fields", ["cityId"], {
            name: "idx_fields_city_id",
        });

        await queryInterface.addIndex("fields", ["isAvailable"], {
            name: "idx_fields_is_available",
        });

        await queryInterface.addIndex("fields", ["isActive"], {
            name: "idx_fields_is_active",
        });

        await queryInterface.addIndex("fields", ["averageRating"], {
            name: "idx_fields_average_rating",
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("fields");
    },
};