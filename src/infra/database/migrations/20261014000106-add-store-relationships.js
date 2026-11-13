"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface) {
    // ============================================================
    // STORE PRODUCTS → CATEGORIES / BRANDS
    // ============================================================
    // O apagamento em cascata de categorias/marcas é bloqueado na
    // aplicação (409); SET NULL é apenas a salvaguarda da base de dados.

    await queryInterface.addConstraint("store_products", {
      fields: ["categoryId"],
      type: "foreign key",
      name: "fk_store_products_category_id",
      references: {
        table: "store_categories",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addConstraint("store_products", {
      fields: ["brandId"],
      type: "foreign key",
      name: "fk_store_products_brand_id",
      references: {
        table: "store_brands",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    // ============================================================
    // STORE PRODUCT VARIANTS → PRODUCTS
    // ============================================================

    await queryInterface.addConstraint("store_product_variants", {
      fields: ["productId"],
      type: "foreign key",
      name: "fk_store_product_variants_product_id",
      references: {
        table: "store_products",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });

    // ============================================================
    // STORE INVENTORY → VARIANTS
    // ============================================================

    await queryInterface.addConstraint("store_inventory", {
      fields: ["variantId"],
      type: "foreign key",
      name: "fk_store_inventory_variant_id",
      references: {
        table: "store_product_variants",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });

    // ============================================================
    // STORE STOCK MOVEMENTS → VARIANTS
    // ============================================================

    await queryInterface.addConstraint("store_stock_movements", {
      fields: ["variantId"],
      type: "foreign key",
      name: "fk_store_stock_movements_variant_id",
      references: {
        table: "store_product_variants",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "store_stock_movements",
      "fk_store_stock_movements_variant_id",
    );
    await queryInterface.removeConstraint(
      "store_inventory",
      "fk_store_inventory_variant_id",
    );
    await queryInterface.removeConstraint(
      "store_product_variants",
      "fk_store_product_variants_product_id",
    );
    await queryInterface.removeConstraint(
      "store_products",
      "fk_store_products_brand_id",
    );
    await queryInterface.removeConstraint(
      "store_products",
      "fk_store_products_category_id",
    );
  },
};
