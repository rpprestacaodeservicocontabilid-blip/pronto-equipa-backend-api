"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_stock_reservations", {
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
      // RESERVATION
      // ============================================================

      variantId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      orderId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // ACTIVE | RELEASED | COMMITTED
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "ACTIVE",
      },

      // Reserva expira (default: 30 min) se a encomenda não avançar.
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: false,
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

    await queryInterface.addIndex("store_stock_reservations", ["variantId"]);
    await queryInterface.addIndex("store_stock_reservations", ["orderId"]);
    await queryInterface.addIndex("store_stock_reservations", ["status", "expiresAt"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_stock_reservations");
  },
};
