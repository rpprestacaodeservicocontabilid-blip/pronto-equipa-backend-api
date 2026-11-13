"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_order_addresses", {
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
      // ADDRESS SNAPSHOT (1 encomenda : 1 entrega inicial)
      // ============================================================

      orderId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "DELIVERY",
      },

      recipientName: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      phone: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },

      // Referência a uma cidade existente (snapshot — sem FK obrigatória).
      cityId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      addressLine: {
        type: Sequelize.STRING(300),
        allowNull: false,
      },

      reference: {
        type: Sequelize.STRING(300),
        allowNull: true,
      },

      latitude: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: true,
      },

      longitude: {
        type: Sequelize.DECIMAL(10, 7),
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

    // Uma morada de entrega por encomenda (atualização in-place).
    await queryInterface.addIndex("store_order_addresses", ["orderId"], {
      name: "store_order_addresses_order_unique",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_order_addresses");
  },
};
