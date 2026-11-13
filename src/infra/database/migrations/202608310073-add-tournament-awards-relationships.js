"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // tournament_awards.tournament_id -> tournaments.id
    await queryInterface.addConstraint("tournament_awards", {
      fields: ["tournament_id"],
      type: "foreign key",
      name: "fk_tournament_awards_tournament_id",
      references: {
        table: "tournaments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // tournament_awards.player_id -> players.id
    await queryInterface.addConstraint("tournament_awards", {
      fields: ["player_id"],
      type: "foreign key",
      name: "fk_tournament_awards_player_id",
      references: {
        table: "players",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // tournament_awards.team_id -> teams.id
    await queryInterface.addConstraint("tournament_awards", {
      fields: ["team_id"],
      type: "foreign key",
      name: "fk_tournament_awards_team_id",
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
      "tournament_awards",
      "fk_tournament_awards_team_id"
    );

    await queryInterface.removeConstraint(
      "tournament_awards",
      "fk_tournament_awards_player_id"
    );

    await queryInterface.removeConstraint(
      "tournament_awards",
      "fk_tournament_awards_tournament_id"
    );
  },
};