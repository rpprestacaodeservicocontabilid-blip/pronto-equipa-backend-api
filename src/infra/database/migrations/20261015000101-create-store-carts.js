"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_carts", {
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
      // CART OWNERSHIP
      // ============================================================

      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // ACTIVE | CONVERTED | ABANDONED
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "ACTIVE",
      },

      // Opcional: expiração de carrinhos abandonados.
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.addIndex("store_carts", ["userId"]);
    await queryInterface.addIndex("store_carts", ["status"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_carts");
  },
};
