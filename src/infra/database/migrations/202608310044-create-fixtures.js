"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("fixtures", {
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

      homeTeamId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      awayTeamId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      date: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      startTime: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      endTime: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      fieldId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      homeScore: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      awayScore: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      isPlayed: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },

      isPublished: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },

      isLocked: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },

      isCancelled: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
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
    await queryInterface.dropTable("fixtures");
  },
};