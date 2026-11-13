"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("tournament_statistics", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      tournamentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
      },

      totalMatches: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      totalGoals: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      totalAssists: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      totalYellowCards: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      totalRedCards: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      totalPlayersUsed: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      totalTeams: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      averageGoalsPerMatch: {
        type: Sequelize.FLOAT,
        allowNull: true,
        defaultValue: 0,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable("tournament_statistics");
  },
};