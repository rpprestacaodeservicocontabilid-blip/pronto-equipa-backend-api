"use strict";

/**
 * Fase 1 — Fundação multiempresa.
 *
 * `audit_logs`: trilho de auditoria imutável por empresa.
 *
 * Regista quem (actor), quando, o que (action), sobre que entidade
 * e os valores antes/depois. Sem `updatedAt` — os registos são
 * apenas acrescentados, nunca editados.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("audit_logs", {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      companyId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: {
          model: "companies",
          key: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },

      actorUserId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },

      action: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },

      entityType: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },

      entityId: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },

      before: {
        type: Sequelize.JSON,
        allowNull: true,
      },

      after: {
        type: Sequelize.JSON,
        allowNull: true,
      },

      ipAddress: {
        type: Sequelize.STRING(60),
        allowNull: true,
      },

      userAgent: {
        type: Sequelize.STRING(300),
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // ============================================================
    // INDEXES
    // ============================================================

    await queryInterface.addIndex(
      "audit_logs",
      ["companyId", "createdAt"],
      {
        name: "idx_audit_logs_company_created",
      },
    );

    await queryInterface.addIndex(
      "audit_logs",
      ["entityType", "entityId"],
      {
        name: "idx_audit_logs_entity",
      },
    );

    await queryInterface.addIndex(
      "audit_logs",
      ["actorUserId"],
      {
        name: "idx_audit_logs_actor",
      },
    );

    await queryInterface.addIndex(
      "audit_logs",
      ["action"],
      {
        name: "idx_audit_logs_action",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("audit_logs");
  },
};
