"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_order_items", {
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
      // ITEM (snapshots imutáveis do catálogo no momento da compra)
      // ============================================================

      orderId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // Nullable: a variante pode deixar de existir depois da compra.
      variantId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      skuSnapshot: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },

      productNameSnapshot: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      // Ex.: "40 / Preto" — descrição da variante no momento da compra.
      variantSnapshot: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },

      unitPrice: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },

      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      lineTotal: {
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

    await queryInterface.addIndex("store_order_items", ["orderId"]);
    await queryInterface.addIndex("store_order_items", ["variantId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_order_items");
  },
};
