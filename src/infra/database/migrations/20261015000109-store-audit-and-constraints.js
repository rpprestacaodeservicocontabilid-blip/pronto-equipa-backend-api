"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    // ============================================================
    // AUDITORIA: autor do movimento de stock (quem fez o ajuste).
    // ============================================================
    await queryInterface.addColumn("store_stock_movements", "createdBy", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addIndex("store_stock_movements", ["createdBy"]);

    // ============================================================
    // NOTA (CHECK constraints):
    //   quantity >= 0, reserved >= 0 e reserved <= quantity são
    //   garantidos por UPDATEs condicionais atómicos (guardas SQL)
    //   e validação em domínio — o SQLite (dialecto de dev) não
    //   suporta ALTER TABLE ... ADD CONSTRAINT CHECK.
    // ============================================================
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("store_stock_movements", ["createdBy"]);
    await queryInterface.removeColumn("store_stock_movements", "createdBy");
  },
};
