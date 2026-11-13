"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("tournament_standings", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      tournamentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      teamId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      position: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      played: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      wins: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      draws: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      losses: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      goalsFor: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      goalsAgainst: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      points: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable("tournament_standings");
  },
};