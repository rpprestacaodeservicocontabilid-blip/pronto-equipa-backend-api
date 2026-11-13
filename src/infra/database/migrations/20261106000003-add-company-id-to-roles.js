"use strict";

/**
 * Fase 1 — Fundação multiempresa.
 *
 * Adiciona `companyId` às `roles`:
 *  - `NULL`  → role global do sistema (ex.: ADMIN, SUPER_ADMIN);
 *  - valor   → role própria de uma empresa (custom, criada pela API).
 *
 * O índice único global de nome é removido porque passa a ser
 * necessário permitir o mesmo nome de role em empresas diferentes.
 * A unicidade por empresa fica garantida por `uq_roles_company_name`
 * (aplica-se a roles com empresa definida) e pela aplicação
 * (para roles globais).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("roles", "companyId", {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: "companies",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.removeIndex("roles", "uq_roles_name");

    await queryInterface.addIndex(
      "roles",
      ["companyId", "name"],
      {
        unique: true,
        name: "uq_roles_company_name",
      },
    );

    await queryInterface.addIndex("roles", ["companyId"], {
      name: "idx_roles_company_id",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("roles", "idx_roles_company_id");
    await queryInterface.removeIndex("roles", "uq_roles_company_name");
    await queryInterface.removeColumn("roles", "companyId");

    // Repõe a unicidade global de nome existente antes da multiempresa.
    await queryInterface.addIndex("roles", ["name"], {
      unique: true,
      name: "uq_roles_name",
    });
  },
};
