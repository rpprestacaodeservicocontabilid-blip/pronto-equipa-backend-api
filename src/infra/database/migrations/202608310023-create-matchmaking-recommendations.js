"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      "matchmaking_recommendations",
      {
        // ============================================================
        // PRIMARY KEY
        // ============================================================

        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
        },

        // ============================================================
        // TEAMS
        // ============================================================

        teamId: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },

        candidateTeamId: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },

        // ============================================================
        // MATCHMAKING SCORE
        // ============================================================

        score: {
          type: Sequelize.FLOAT,
          allowNull: false,
        },

        strategy: {
          type: Sequelize.STRING,
          allowNull: false,
        },

        // ============================================================
        // CITY
        // ============================================================

        cityId: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },

        // ============================================================
        // ACCEPTANCE
        // ============================================================

        isAccepted: {
          type: Sequelize.BOOLEAN,
          allowNull: true,
          defaultValue: false,
        },
      },
    );

    // ============================================================
    // INDEXES
    // ============================================================

    await queryInterface.addIndex(
      "matchmaking_recommendations",
      ["teamId"],
      {
        name: "idx_matchmaking_recommendations_team_id",
      },
    );

    await queryInterface.addIndex(
      "matchmaking_recommendations",
      ["candidateTeamId"],
      {
        name: "idx_matchmaking_recommendations_candidate_team_id",
      },
    );

    await queryInterface.addIndex(
      "matchmaking_recommendations",
      ["cityId"],
      {
        name: "idx_matchmaking_recommendations_city_id",
      },
    );

    await queryInterface.addIndex(
      "matchmaking_recommendations",
      ["score"],
      {
        name: "idx_matchmaking_recommendations_score",
      },
    );

    await queryInterface.addIndex(
      "matchmaking_recommendations",
      ["isAccepted"],
      {
        name: "idx_matchmaking_recommendations_is_accepted",
      },
    );

    await queryInterface.addIndex(
      "matchmaking_recommendations",
      ["teamId", "candidateTeamId"],
      {
        name: "idx_matchmaking_recommendations_team_candidate",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable(
      "matchmaking_recommendations",
    );
  },
};