"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("payment_transactions", {
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

      gateway: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      transactionId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
      },

      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      rawResponse: {
        type: Sequelize.JSON,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex(
      "payment_transactions",
      ["paymentId"],
      {
        name: "idx_payment_transactions_payment",
      }
    );

    await queryInterface.addIndex(
      "payment_transactions",
      ["gateway"],
      {
        name: "idx_payment_transactions_gateway",
      }
    );

    await queryInterface.addIndex(
      "payment_transactions",
      ["transactionId"],
      {
        name: "idx_payment_transactions_transaction_id",
      }
    );

    await queryInterface.addIndex(
      "payment_transactions",
      ["status"],
      {
        name: "idx_payment_transactions_status",
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("payment_transactions");
  },
};