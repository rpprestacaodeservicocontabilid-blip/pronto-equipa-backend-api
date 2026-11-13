"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_stock_movements", {
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
      // MOVEMENT INFORMATION
      // ============================================================

      variantId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // IN (entrada) | OUT (saída) | ADJUST (ajuste físico)
      type: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },

      // Delta aplicado (positivo na entrada, negativo na saída).
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // Stock resultante depois do movimento (para auditoria).
      resultQuantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      reason: {
        type: Sequelize.STRING(200),
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

    await queryInterface.addIndex("store_stock_movements", ["variantId"]);
    await queryInterface.addIndex("store_stock_movements", ["createdAt"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_stock_movements");
  },
};
