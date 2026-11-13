"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_inventory", {
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
      // STOCK INFORMATION (por variante)
      // ============================================================

      variantId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
      },

      // Unidades físicas em armazém.
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      // Unidades reservadas por encomendas pendentes (fase de checkout).
      reserved: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      // Limiar de alerta de stock baixo.
      minStock: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_inventory");
  },
};
