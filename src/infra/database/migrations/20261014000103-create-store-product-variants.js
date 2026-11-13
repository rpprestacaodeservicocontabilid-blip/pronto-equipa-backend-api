"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_product_variants", {
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
      // VARIANT INFORMATION
      // ============================================================

      productId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // Tamanho (ex.: "40", "M") — opcional para produtos sem tamanho.
      size: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },

      // Cor (ex.: "Preto", "Branco").
      color: {
        type: Sequelize.STRING(40),
        allowNull: true,
      },

      sku: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },

      // Preço próprio da variante — null usa o preço base do produto.
      price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },

      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex("store_product_variants", ["productId"]);
    await queryInterface.addIndex("store_product_variants", ["sku"], {
      name: "store_product_variants_sku_unique",
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_product_variants");
  },
};
