"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "auth_verification_tokens",
      {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },

        authAccountId: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },

        tokenHash: {
          type: Sequelize.STRING(255),
          allowNull: false,
          unique: true,
        },

        expiresAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },

        usedAt: {
          type: Sequelize.DATE,
          allowNull: true,
        },

        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      },
    );

    // ============================================================
    // INDEXES
    // ============================================================

    await queryInterface.addIndex(
      "auth_verification_tokens",
      ["authAccountId"],
      {
        name: "idx_auth_verification_tokens_auth_account_id",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable(
      "auth_verification_tokens",
    );
  },
};