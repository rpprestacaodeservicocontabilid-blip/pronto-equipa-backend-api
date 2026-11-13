"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("matchmaking_matches", {
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
      // MATCHMAKING REQUEST
      // ============================================================

      requestId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // ============================================================
      // TEAMS
      // ============================================================

      homeTeamId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      awayTeamId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // ============================================================
      // FIELD
      // ============================================================

      fieldId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      // ============================================================
      // CITY
      // ============================================================

      cityId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // ============================================================
      // MATCH DATE
      // ============================================================

      matchDate: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      // ============================================================
      // STATUS
      // ============================================================

      status: {
        type: Sequelize.ENUM(
          "SCHEDULED",
          "LIVE",
          "FINISHED",
          "CANCELLED",
        ),
        allowNull: true,
        defaultValue: "SCHEDULED",
      },

      // ============================================================
      // SCORE
      // ============================================================

      homeScore: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      awayScore: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      // ============================================================
      // CREATED AT
      // ============================================================

      createdAt: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // ============================================================
    // INDEXES
    // ============================================================

    await queryInterface.addIndex(
      "matchmaking_matches",
      ["requestId"],
      {
        name: "idx_matchmaking_matches_request_id",
      },
    );

    await queryInterface.addIndex(
      "matchmaking_matches",
      ["homeTeamId"],
      {
        name: "idx_matchmaking_matches_home_team_id",
      },
    );

    await queryInterface.addIndex(
      "matchmaking_matches",
      ["awayTeamId"],
      {
        name: "idx_matchmaking_matches_away_team_id",
      },
    );

    await queryInterface.addIndex(
      "matchmaking_matches",
      ["fieldId"],
      {
        name: "idx_matchmaking_matches_field_id",
      },
    );

    await queryInterface.addIndex(
      "matchmaking_matches",
      ["cityId"],
      {
        name: "idx_matchmaking_matches_city_id",
      },
    );

    await queryInterface.addIndex(
      "matchmaking_matches",
      ["matchDate"],
      {
        name: "idx_matchmaking_matches_match_date",
      },
    );

    await queryInterface.addIndex(
      "matchmaking_matches",
      ["status"],
      {
        name: "idx_matchmaking_matches_status",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("matchmaking_matches");
  },
};