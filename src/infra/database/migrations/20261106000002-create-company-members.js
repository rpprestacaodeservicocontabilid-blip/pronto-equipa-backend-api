"use strict";

/**
 * Fase 1 — Fundação multiempresa.
 *
 * `company_members`: vínculo de um utilizador a uma empresa (tenant)
 * com o papel (role) exercido dentro dessa empresa.
 *
 * O papel é guardado na própria associação (e não em `user_roles`)
 * para que:
 *  - `user_roles` permaneça global (claims do JWT sem fugas entre empresas);
 *  - o mesmo utilizador possa ter papéis diferentes em empresas diferentes.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("company_members", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: {
          model: "companies",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },

      userId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },

      roleId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        references: {
          model: "roles",
          key: "id",
        },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },

      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: "ACTIVE",
      },

      invitedBy: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },

      joinedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // ============================================================
    // INDEXES
    // ============================================================

    await queryInterface.addIndex(
      "company_members",
      ["companyId", "userId"],
      {
        unique: true,
        name: "uq_company_members_company_user",
      },
    );

    await queryInterface.addIndex(
      "company_members",
      ["companyId", "status"],
      {
        name: "idx_company_members_company_status",
      },
    );

    await queryInterface.addIndex(
      "company_members",
      ["userId"],
      {
        name: "idx_company_members_user",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("company_members");
  },
};
