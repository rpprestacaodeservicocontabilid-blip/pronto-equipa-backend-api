"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_product_images", {
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
      // IMAGE REFERENCE
      // ============================================================

      productId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // Imagem opcional de uma variante específica (ex.: cor).
      variantId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      url: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },

      altText: {
        type: Sequelize.STRING(150),
        allowNull: true,
      },

      // Ordem de exibição na galeria do produto (0 = principal).
      position: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

    await queryInterface.addIndex("store_product_images", ["productId"]);
    await queryInterface.addIndex("store_product_images", ["variantId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_product_images");
  },
};
