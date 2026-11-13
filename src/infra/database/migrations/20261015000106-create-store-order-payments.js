"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("store_order_payments", {
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
      // PAYMENT LINK (integração por referência com o módulo de pagamentos)
      // ============================================================

      orderId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // ID do pagamento no módulo de pagamentos (sem FK: contrato público).
      // Null quando o administrador confirma o pagamento manualmente.
      paymentId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      // PENDING | PAID | FAILED | REFUNDED | MANUAL
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },

      amount: {
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

    await queryInterface.addIndex("store_order_payments", ["orderId"]);
    await queryInterface.addIndex("store_order_payments", ["paymentId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("store_order_payments");
  },
};
