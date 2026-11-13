"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("permissions", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      description: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },

      resource: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },

      action: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },

      scope: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "GLOBAL",
      },

      isSystem: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // ============================================================
    // UNIQUE INDEX — NAME
    // ============================================================

    await queryInterface.addIndex("permissions", ["name"], {
      unique: true,
      name: "uq_permissions_name",
    });

    // ============================================================
    // INDEX — RESOURCE + ACTION
    // ============================================================

    await queryInterface.addIndex(
      "permissions",
      ["resource", "action"],
      {
        name: "idx_permissions_resource_action",
      },
    );

    // ============================================================
    // INDEX — SCOPE
    // ============================================================

    await queryInterface.addIndex("permissions", ["scope"], {
      name: "idx_permissions_scope",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("permissions");
  },
};