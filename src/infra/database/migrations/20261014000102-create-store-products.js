"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_products", {
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
      // PRODUCT INFORMATION
      // ============================================================

      name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      // Preço base (Kz) — cada variante pode ter preço próprio.
      price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },

      imageUrl: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },

      // DRAFT | ACTIVE | ARCHIVED (o apagamento físico é reservado
      // para produtos sem histórico de encomendas).
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "ACTIVE",
      },

      categoryId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      brandId: {
        type: Sequelize.INTEGER,
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

    await queryInterface.addIndex("store_products", ["status"]);
    await queryInterface.addIndex("store_products", ["categoryId"]);
    await queryInterface.addIndex("store_products", ["brandId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_products");
  },
};
