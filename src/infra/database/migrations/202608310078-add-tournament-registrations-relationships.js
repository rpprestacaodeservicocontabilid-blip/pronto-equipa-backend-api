"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // tournament_registrations.tournamentId -> tournaments.id
    await queryInterface.addConstraint("tournament_registrations", {
      fields: ["tournamentId"],
      type: "foreign key",
      name: "fk_tournament_registrations_tournament_id",
      references: {
        table: "tournaments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // tournament_registrations.teamId -> teams.id
    await queryInterface.addConstraint("tournament_registrations", {
      fields: ["teamId"],
      type: "foreign key",
      name: "fk_tournament_registrations_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "tournament_registrations",
      "fk_tournament_registrations_team_id"
    );

    await queryInterface.removeConstraint(
      "tournament_registrations",
      "fk_tournament_registrations_tournament_id"
    );
  },
};