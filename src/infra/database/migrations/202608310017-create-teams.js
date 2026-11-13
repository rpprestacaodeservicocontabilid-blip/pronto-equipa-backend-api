"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("teams", {
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
      // TEAM INFORMATION
      // ============================================================

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      logo: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      // ============================================================
      // RELATIONSHIPS
      // ============================================================

      cityId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      ownerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // ============================================================
      // STATUS
      // ============================================================

      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
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

    await queryInterface.addIndex("teams", ["cityId"], {
      name: "idx_teams_city_id",
    });

    await queryInterface.addIndex("teams", ["ownerId"], {
      name: "idx_teams_owner_id",
    });

    await queryInterface.addIndex("teams", ["isActive"], {
      name: "idx_teams_is_active",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("teams");
  },
};