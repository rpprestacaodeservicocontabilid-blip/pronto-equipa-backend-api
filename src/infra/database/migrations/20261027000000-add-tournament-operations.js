"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("tournaments", "cityId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "cities", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("tournaments", "organizerId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("tournaments", "suspendedFromStatus", {
      type: Sequelize.STRING(50),
      allowNull: true,
    });

    await queryInterface.createTable("tournament_fixture_result_history", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      fixtureId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "fixtures", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      tournamentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "tournaments", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      actorUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      previousHomeScore: { type: Sequelize.INTEGER, allowNull: true },
      previousAwayScore: { type: Sequelize.INTEGER, allowNull: true },
      homeScore: { type: Sequelize.INTEGER, allowNull: false },
      awayScore: { type: Sequelize.INTEGER, allowNull: false },
      reason: { type: Sequelize.TEXT, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable("tournament_incidents", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      tournamentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "tournaments", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      fixtureId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "fixtures", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      type: { type: Sequelize.STRING(20), allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "OPEN" },
      title: { type: Sequelize.STRING(180), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: false },
      resolutionNote: { type: Sequelize.TEXT, allowNull: true },
      reportedBy: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      resolvedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      resolvedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("tournaments", ["cityId"], { name: "idx_tournaments_city_id" });
    await queryInterface.addIndex("tournaments", ["organizerId"], { name: "idx_tournaments_organizer_id" });
    await queryInterface.addIndex("tournament_fixture_result_history", ["tournamentId", "createdAt"], {
      name: "idx_tournament_result_history_tournament_created",
    });
    await queryInterface.addIndex("tournament_incidents", ["tournamentId", "status", "createdAt"], {
      name: "idx_tournament_incidents_tournament_status_created",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("tournament_incidents");
    await queryInterface.dropTable("tournament_fixture_result_history");
    await queryInterface.removeIndex("tournaments", "idx_tournaments_organizer_id");
    await queryInterface.removeIndex("tournaments", "idx_tournaments_city_id");
    await queryInterface.removeColumn("tournaments", "organizerId");
    await queryInterface.removeColumn("tournaments", "suspendedFromStatus");
    await queryInterface.removeColumn("tournaments", "cityId");
  },
};
