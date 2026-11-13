"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("tournament_histories", {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      tournamentId: {
        type: Sequelize.BIGINT,
        allowNull: false,
        unique: true,
      },

      tournamentName: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },

      tournamentType: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },

      seasonId: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },

      seasonName: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      cityId: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },

      cityName: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      championTeamId: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },

      championTeamName: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      runnerUpTeamId: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },

      runnerUpTeamName: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      startedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      finishedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex(
      "tournament_histories",
      ["tournamentId"],
      {
        unique: true,
        name: "tournament_histories_tournament_id_unique",
      },
    );

    await queryInterface.addIndex(
      "tournament_histories",
      ["seasonId"],
      {
        name: "tournament_histories_season_id",
      },
    );

    await queryInterface.addIndex(
      "tournament_histories",
      ["cityId"],
      {
        name: "tournament_histories_city_id",
      },
    );

    await queryInterface.addIndex(
      "tournament_histories",
      ["championTeamId"],
      {
        name: "tournament_histories_champion_team_id",
      },
    );

    await queryInterface.createTable("tournament_history_entries", {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      historyId: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },

      teamId: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },

      teamName: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      playerId: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },

      playerName: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      position: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      awardType: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },

      value: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex(
      "tournament_history_entries",
      ["historyId"],
      {
        name: "tournament_history_entries_history_id",
      },
    );

    await queryInterface.addIndex(
      "tournament_history_entries",
      ["teamId"],
      {
        name: "tournament_history_entries_team_id",
      },
    );

    await queryInterface.addIndex(
      "tournament_history_entries",
      ["playerId"],
      {
        name: "tournament_history_entries_player_id",
      },
    );

    await queryInterface.addIndex(
      "tournament_history_entries",
      ["type"],
      {
        name: "tournament_history_entries_type",
      },
    );

    await queryInterface.addIndex(
      "tournament_history_entries",
      ["awardType"],
      {
        name: "tournament_history_entries_award_type",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("tournament_history_entries");
    await queryInterface.dropTable("tournament_histories");
  },
};