"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("matches", "resultValidationStatus", {
      type: Sequelize.STRING(24),
      allowNull: false,
      defaultValue: "PENDING",
    });

    await queryInterface.createTable("match_disputes", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      matchId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "matches", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      reportingTeamId: { type: Sequelize.INTEGER, allowNull: false },
      reporterUserId: { type: Sequelize.INTEGER, allowNull: false },
      category: { type: Sequelize.STRING(16), allowNull: false, defaultValue: "RESULT" },
      reason: { type: Sequelize.TEXT, allowNull: false },
      evidenceUrl: { type: Sequelize.STRING(2048), allowNull: true },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: "OPEN" },
      originalHomeScore: { type: Sequelize.INTEGER, allowNull: false },
      originalAwayScore: { type: Sequelize.INTEGER, allowNull: false },
      decision: { type: Sequelize.STRING(16), allowNull: true },
      finalHomeScore: { type: Sequelize.INTEGER, allowNull: true },
      finalAwayScore: { type: Sequelize.INTEGER, allowNull: true },
      resolutionNote: { type: Sequelize.TEXT, allowNull: true },
      resolvedBy: { type: Sequelize.INTEGER, allowNull: true },
      resolvedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("match_disputes", ["matchId", "status"], {
      name: "idx_match_disputes_match_status",
    });
    await queryInterface.addIndex("match_disputes", ["status", "createdAt"], {
      name: "idx_match_disputes_status_created",
    });

    await queryInterface.bulkUpdate(
      "matches",
      { resultValidationStatus: "PENDING" },
      { status: "FINISHED" },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("match_disputes");
    await queryInterface.removeColumn("matches", "resultValidationStatus");
  },
};
