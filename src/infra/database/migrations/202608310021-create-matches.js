"use strict";

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("matches", {
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
        allowNull: false,
      },

      // ============================================================
      // TOURNAMENT
      // ============================================================

      tournamentId: {
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
      // MATCH
      // ============================================================

      matchDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
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
      // STATUS
      // ============================================================

      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
    });

    // ============================================================
    // INDEXES
    // ============================================================

    await queryInterface.addIndex("matches", ["homeTeamId"], {
      name: "idx_matches_home_team_id",
    });

    await queryInterface.addIndex("matches", ["awayTeamId"], {
      name: "idx_matches_away_team_id",
    });

    await queryInterface.addIndex("matches", ["fieldId"], {
      name: "idx_matches_field_id",
    });

    await queryInterface.addIndex("matches", ["tournamentId"], {
      name: "idx_matches_tournament_id",
    });

    await queryInterface.addIndex("matches", ["cityId"], {
      name: "idx_matches_city_id",
    });

    await queryInterface.addIndex("matches", ["matchDate"], {
      name: "idx_matches_match_date",
    });

    await queryInterface.addIndex("matches", ["status"], {
      name: "idx_matches_status",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("matches");
  },
};