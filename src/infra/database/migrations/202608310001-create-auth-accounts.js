"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("auth_accounts", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      provider: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },

      providerAccountId: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },

      passwordHash: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },

      emailVerifiedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      failedLoginAttempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      lockedUntil: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      lastLoginAt: {
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
      "auth_accounts",
      ["provider", "providerAccountId"],
      {
        unique: true,
        name: "uq_auth_accounts_provider_account",
      },
    );

    await queryInterface.addIndex(
      "auth_accounts",
      ["email"],
      {
        unique: true,
        name: "uq_auth_accounts_email",
      },
    );

    await queryInterface.addIndex(
      "auth_accounts",
      ["userId"],
      {
        name: "idx_auth_accounts_user_id",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("auth_accounts");
  },
};