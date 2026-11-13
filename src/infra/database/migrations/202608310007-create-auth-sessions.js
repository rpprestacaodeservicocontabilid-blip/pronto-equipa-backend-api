"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "auth_sessions",
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

        refreshTokenId: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },

        status: {
          type: Sequelize.STRING(30),
          allowNull: false,
        },

        ipAddress: {
          type: Sequelize.STRING(100),
          allowNull: true,
        },

        userAgent: {
          type: Sequelize.TEXT,
          allowNull: true,
        },

        deviceId: {
          type: Sequelize.STRING(255),
          allowNull: true,
        },

        expiresAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },

        lastActivityAt: {
          type: Sequelize.DATE,
          allowNull: true,
        },

        revokedAt: {
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
      },
    );

    // ============================================================
    // INDEXES
    // ============================================================

    await queryInterface.addIndex(
      "auth_sessions",
      ["authAccountId"],
      {
        name: "idx_auth_sessions_auth_account_id",
      },
    );

    await queryInterface.addIndex(
      "auth_sessions",
      ["status"],
      {
        name: "idx_auth_sessions_status",
      },
    );

    await queryInterface.addIndex(
      "auth_sessions",
      ["expiresAt"],
      {
        name: "idx_auth_sessions_expires_at",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable(
      "auth_sessions",
    );
  },
};