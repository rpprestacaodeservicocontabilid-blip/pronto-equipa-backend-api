"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("matchmaking_search_attempts", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      teamId: { type: Sequelize.INTEGER, allowNull: false },
      cityId: { type: Sequelize.INTEGER, allowNull: false },
      status: { type: Sequelize.STRING(16), allowNull: false },
      candidateCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      errorMessage: { type: Sequelize.STRING(500), allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("matchmaking_search_attempts", ["status", "createdAt"], {
      name: "idx_matchmaking_search_attempts_status_created",
    });
    await queryInterface.addIndex("matchmaking_search_attempts", ["teamId", "createdAt"], {
      name: "idx_matchmaking_search_attempts_team_created",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("matchmaking_search_attempts");
  },
};
