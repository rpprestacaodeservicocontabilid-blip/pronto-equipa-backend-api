"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_orders", {
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
      // ORDER
      // ============================================================

      // Número legível ao cliente (ex.: PD-LX8K2P-4F9).
      orderNumber: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },

      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // PENDING_PAYMENT | PAID | PROCESSING | COMPLETED | CANCELLED
      status: {
        type: Sequelize.STRING(24),
        allowNull: false,
        defaultValue: "PENDING_PAYMENT",
      },

      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: "AOA",
      },

      // ============================================================
      // MONEY (calculados no servidor)
      // ============================================================

      subtotal: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },

      shippingAmount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },

      discountAmount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },

      totalAmount: {
        type: Sequelize.DECIMAL(12, 2),
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

    await queryInterface.addIndex("store_orders", ["userId"]);
    await queryInterface.addIndex("store_orders", ["status"]);
    await queryInterface.addIndex("store_orders", ["orderNumber"], {
      name: "store_orders_order_number_unique",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_orders");
  },
};
