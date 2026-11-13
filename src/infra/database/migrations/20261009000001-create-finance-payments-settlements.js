"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("finance_payments", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      matchPaymentId: {
        type: Sequelize.UUID,
        allowNull: false,
      },

      payerId: {
        type: Sequelize.UUID,
        allowNull: false,
      },

      amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },

      provider: {
        type: Sequelize.ENUM(
          "stripe",
          "paypal",
          "multicaixa",
          "unitel_money",
        ),
        allowNull: false,
      },

      providerTransactionId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      status: {
        type: Sequelize.ENUM(
          "pending",
          "processing",
          "paid",
          "failed",
          "refunded",
        ),
        allowNull: false,
        defaultValue: "pending",
      },

      paidAt: {
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

      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex(
      "finance_payments",
      ["matchPaymentId"],
      {
        name: "idx_finance_payments_match_payment_id",
      },
    );

    await queryInterface.createTable("match_payments", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      matchId: {
        type: Sequelize.UUID,
        allowNull: false,
      },

      totalAmount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },

      amountPaid: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },

      platformFee: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },

      fieldFee: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },

      refereeFee: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },

      liveCoverageFee: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },

      splitStrategy: {
        type: Sequelize.ENUM(
          "single_team",
          "half_half",
          "custom",
        ),
        allowNull: false,
      },

      status: {
        type: Sequelize.ENUM(
          "pending",
          "partially_paid",
          "paid",
          "cancelled",
        ),
        allowNull: false,
        defaultValue: "pending",
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex(
      "match_payments",
      ["matchId"],
      {
        name: "idx_match_payments_match_id",
      },
    );

    await queryInterface.createTable("finance_settlements", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      matchPaymentId: {
        type: Sequelize.UUID,
        allowNull: false,
      },

      totalAmount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },

      status: {
        type: Sequelize.ENUM(
          "pending",
          "processing",
          "completed",
          "failed",
        ),
        allowNull: false,
        defaultValue: "pending",
      },

      settledAt: {
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

      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.createTable("finance_settlement_items", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      settlementId: {
        type: Sequelize.UUID,
        allowNull: false,
      },

      recipientId: {
        type: Sequelize.UUID,
        allowNull: false,
      },

      amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex(
      "finance_settlement_items",
      ["settlementId"],
      {
        name: "idx_finance_settlement_items_settlement_id",
      },
    );

    await queryInterface.addConstraint("finance_settlement_items", {
      fields: ["settlementId"],
      type: "foreign key",
      name: "fk_finance_settlement_items_settlement_id",
      references: {
        table: "finance_settlements",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "finance_settlement_items",
      "fk_finance_settlement_items_settlement_id",
    );

    await queryInterface.dropTable("finance_settlement_items");

    await queryInterface.dropTable("finance_settlements");

    await queryInterface.dropTable("match_payments");

    await queryInterface.dropTable("finance_payments");
  },
};
