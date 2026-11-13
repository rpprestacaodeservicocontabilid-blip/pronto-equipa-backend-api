"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint("tournament_standings", {
      fields: ["tournamentId"],
      type: "foreign key",
      name: "fk_tournament_standings_tournament",
      references: {
        table: "tournaments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    await queryInterface.addConstraint("tournament_standings", {
      fields: ["teamId"],
      type: "foreign key",
      name: "fk_tournament_standings_team",
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
      "tournament_standings",
      "fk_tournament_standings_team"
    );

    await queryInterface.removeConstraint(
      "tournament_standings",
      "fk_tournament_standings_tournament"
    );
  },
};