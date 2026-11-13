"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("finance_wallets", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      ownerId: {
        type: Sequelize.UUID,
        allowNull: false,
      },

      ownerType: {
        type: Sequelize.ENUM(
          "TEAM",
          "FIELD",
          "REFEREE",
          "STREAMER",
          "PLATFORM",
        ),
        allowNull: false,
      },

      availableBalance: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },

      pendingBalance: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
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
      "finance_wallets",
      ["ownerId", "ownerType"],
      {
        unique: true,
        name: "uq_finance_wallets_owner",
      },
    );

    await queryInterface.createTable("finance_ledger_entries", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      walletId: {
        type: Sequelize.UUID,
        allowNull: false,
      },

      type: {
        type: Sequelize.ENUM("credit", "debit", "settlement"),
        allowNull: false,
      },

      amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },

      referenceType: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      referenceId: {
        type: Sequelize.UUID,
        allowNull: true,
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex(
      "finance_ledger_entries",
      ["walletId"],
      {
        name: "idx_finance_ledger_wallet_id",
      },
    );

    await queryInterface.addConstraint("finance_ledger_entries", {
      fields: ["walletId"],
      type: "foreign key",
      name: "fk_finance_ledger_wallet_id",
      references: {
        table: "finance_wallets",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "finance_ledger_entries",
      "fk_finance_ledger_wallet_id",
    );

    await queryInterface.dropTable("finance_ledger_entries");

    await queryInterface.dropTable("finance_wallets");
  },
};
