"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "auth_refresh_tokens",
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

        sessionId: {
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

        revokedAt: {
          type: Sequelize.DATE,
          allowNull: true,
        },

        replacedByTokenId: {
          type: Sequelize.INTEGER,
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
      "auth_refresh_tokens",
      ["tokenHash"],
      {
        unique: true,
        name: "uq_auth_refresh_tokens_token_hash",
      },
    );

    await queryInterface.addIndex(
      "auth_refresh_tokens",
      ["authAccountId"],
      {
        name: "idx_auth_refresh_tokens_auth_account_id",
      },
    );

    await queryInterface.addIndex(
      "auth_refresh_tokens",
      ["sessionId"],
      {
        name: "idx_auth_refresh_tokens_session_id",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable(
      "auth_refresh_tokens",
    );
  },
};