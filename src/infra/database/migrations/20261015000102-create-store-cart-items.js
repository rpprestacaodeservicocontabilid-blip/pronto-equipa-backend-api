"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_cart_items", {
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
      // ITEM
      // ============================================================

      cartId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      variantId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
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

    await queryInterface.addIndex("store_cart_items", ["cartId"]);
    // Uma linha por variante por carrinho (somar quantidades na aplicação).
    await queryInterface.addIndex("store_cart_items", ["cartId", "variantId"], {
      name: "store_cart_items_cart_variant_unique",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_cart_items");
  },
};
