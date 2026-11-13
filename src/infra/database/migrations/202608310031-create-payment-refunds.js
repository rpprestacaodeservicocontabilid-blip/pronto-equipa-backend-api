"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("payment_refunds", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      paymentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },

      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex(
      "payment_refunds",
      ["paymentId"],
      {
        name: "idx_payment_refunds_payment",
      }
    );

    await queryInterface.addIndex(
      "payment_refunds",
      ["status"],
      {
        name: "idx_payment_refunds_status",
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("payment_refunds");
  },
};