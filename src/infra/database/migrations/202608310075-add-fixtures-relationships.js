"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // fixtures.tournamentId -> tournaments.id
    await queryInterface.addConstraint("fixtures", {
      fields: ["tournamentId"],
      type: "foreign key",
      name: "fk_fixtures_tournament_id",
      references: {
        table: "tournaments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // fixtures.homeTeamId -> teams.id
    await queryInterface.addConstraint("fixtures", {
      fields: ["homeTeamId"],
      type: "foreign key",
      name: "fk_fixtures_home_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // fixtures.awayTeamId -> teams.id
    await queryInterface.addConstraint("fixtures", {
      fields: ["awayTeamId"],
      type: "foreign key",
      name: "fk_fixtures_away_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // fixtures.fieldId -> fields.id
    await queryInterface.addConstraint("fixtures", {
      fields: ["fieldId"],
      type: "foreign key",
      name: "fk_fixtures_field_id",
      references: {
        table: "fields",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "fixtures",
      "fk_fixtures_field_id"
    );

    await queryInterface.removeConstraint(
      "fixtures",
      "fk_fixtures_away_team_id"
    );

    await queryInterface.removeConstraint(
      "fixtures",
      "fk_fixtures_home_team_id"
    );

    await queryInterface.removeConstraint(
      "fixtures",
      "fk_fixtures_tournament_id"
    );
  },
};