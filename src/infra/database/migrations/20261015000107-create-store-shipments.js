"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_shipments", {
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
      // SHIPMENT (1 encomenda : 1 remessa)
      // ============================================================

      orderId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // PREPARING | DISPATCHED | DELIVERED | CANCELLED
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "PREPARING",
      },

      shippingMethod: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: "HOME_DELIVERY",
      },

      trackingCode: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },

      carrier: {
        type: Sequelize.STRING(80),
        allowNull: true,
      },

      shippingCost: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },

      shippedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      deliveredAt: {
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

    await queryInterface.addIndex("store_shipments", ["orderId"], {
      name: "store_shipments_order_unique",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_shipments");
  },
};
