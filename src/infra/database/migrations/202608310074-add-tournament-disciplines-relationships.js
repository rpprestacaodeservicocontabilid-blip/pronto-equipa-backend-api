"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // players.id é UUID.
    // tournament_disciplines.playerId precisa ter o mesmo tipo.
    await queryInterface.changeColumn(
      "tournament_disciplines",
      "playerId",
      {
        type: Sequelize.UUID,
        allowNull: true,
      }
    );

    // tournament_disciplines.tournamentId -> tournaments.id
    await queryInterface.addConstraint("tournament_disciplines", {
      fields: ["tournamentId"],
      type: "foreign key",
      name: "fk_tournament_disciplines_tournament_id",
      references: {
        table: "tournaments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // tournament_disciplines.matchId -> matches.id
    await queryInterface.addConstraint("tournament_disciplines", {
      fields: ["matchId"],
      type: "foreign key",
      name: "fk_tournament_disciplines_match_id",
      references: {
        table: "matches",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // tournament_disciplines.playerId -> players.id
    await queryInterface.addConstraint("tournament_disciplines", {
      fields: ["playerId"],
      type: "foreign key",
      name: "fk_tournament_disciplines_player_id",
      references: {
        table: "players",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // tournament_disciplines.teamId -> teams.id
    await queryInterface.addConstraint("tournament_disciplines", {
      fields: ["teamId"],
      type: "foreign key",
      name: "fk_tournament_disciplines_team_id",
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
      "tournament_disciplines",
      "fk_tournament_disciplines_team_id"
    );

    await queryInterface.removeConstraint(
      "tournament_disciplines",
      "fk_tournament_disciplines_player_id"
    );

    await queryInterface.removeConstraint(
      "tournament_disciplines",
      "fk_tournament_disciplines_match_id"
    );

    await queryInterface.removeConstraint(
      "tournament_disciplines",
      "fk_tournament_disciplines_tournament_id"
    );

    // Reverte o tipo original definido no Model atual.
    await queryInterface.changeColumn(
      "tournament_disciplines",
      "playerId",
      {
        type: Sequelize.INTEGER,
        allowNull: true,
      }
    );
  },
};