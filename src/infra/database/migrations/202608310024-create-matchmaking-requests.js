"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("matchmaking_requests", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      requesterTeamId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      candidateTeamId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      cityId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      status: {
        type: Sequelize.ENUM(
          "PENDING",
          "ACCEPTED",
          "REJECTED",
          "EXPIRED"
        ),
        allowNull: false,
        defaultValue: "PENDING",
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Índices para acelerar as principais consultas
    await queryInterface.addIndex(
      "matchmaking_requests",
      ["requesterTeamId"],
      {
        name: "idx_matchmaking_requests_requester_team",
      }
    );

    await queryInterface.addIndex(
      "matchmaking_requests",
      ["candidateTeamId"],
      {
        name: "idx_matchmaking_requests_candidate_team",
      }
    );

    await queryInterface.addIndex(
      "matchmaking_requests",
      ["cityId"],
      {
        name: "idx_matchmaking_requests_city",
      }
    );

    await queryInterface.addIndex(
      "matchmaking_requests",
      ["status"],
      {
        name: "idx_matchmaking_requests_status",
      }
    );

    await queryInterface.addIndex(
      "matchmaking_requests",
      ["requesterTeamId", "candidateTeamId"],
      {
        name: "idx_matchmaking_requests_teams",
      }
    );

    await queryInterface.addIndex(
      "matchmaking_requests",
      ["candidateTeamId", "status"],
      {
        name: "idx_matchmaking_requests_candidate_status",
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("matchmaking_requests");
  },
};