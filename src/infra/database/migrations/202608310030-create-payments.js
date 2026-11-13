"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("payments", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      cityId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      teamId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      tournamentId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      matchId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },

      currency: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "AOA",
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      method: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      reference: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
      },

      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
    });

    // Índices para consultas frequentes
    await queryInterface.addIndex(
      "payments",
      ["userId"],
      {
        name: "idx_payments_user",
      }
    );

    await queryInterface.addIndex(
      "payments",
      ["cityId"],
      {
        name: "idx_payments_city",
      }
    );

    await queryInterface.addIndex(
      "payments",
      ["teamId"],
      {
        name: "idx_payments_team",
      }
    );

    await queryInterface.addIndex(
      "payments",
      ["tournamentId"],
      {
        name: "idx_payments_tournament",
      }
    );

    await queryInterface.addIndex(
      "payments",
      ["matchId"],
      {
        name: "idx_payments_match",
      }
    );

    await queryInterface.addIndex(
      "payments",
      ["status"],
      {
        name: "idx_payments_status",
      }
    );

    await queryInterface.addIndex(
      "payments",
      ["method"],
      {
        name: "idx_payments_method",
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("payments");
  },
};