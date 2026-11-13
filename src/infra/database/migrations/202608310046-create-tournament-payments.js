"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("tournament_payments", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      tournament_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      registration_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      payment_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },

      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
      },

      reference: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },

      paid_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      refunded_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex(
      "tournament_payments",
      ["tournament_id"],
      {
        name: "tournament_payments_tournament_id",
      },
    );

    await queryInterface.addIndex(
      "tournament_payments",
      ["team_id"],
      {
        name: "tournament_payments_team_id",
      },
    );

    await queryInterface.addIndex(
      "tournament_payments",
      ["registration_id"],
      {
        unique: true,
        name: "tournament_payments_registration_id_unique",
      },
    );

    await queryInterface.addIndex(
      "tournament_payments",
      ["payment_id"],
      {
        name: "tournament_payments_payment_id",
      },
    );

    await queryInterface.addIndex(
      "tournament_payments",
      ["status"],
      {
        name: "tournament_payments_status",
      },
    );

    await queryInterface.addIndex(
      "tournament_payments",
      ["tournament_id", "team_id"],
      {
        name: "tournament_payments_tournament_id_team_id",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("tournament_payments");
  },
};