"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // player_statistics.playerId -> players.id
    await queryInterface.addConstraint("player_statistics", {
      fields: ["playerId"],
      type: "foreign key",
      name: "fk_player_statistics_player_id",
      references: {
        table: "players",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // player_statistics.matchId -> matches.id
    await queryInterface.addConstraint("player_statistics", {
      fields: ["matchId"],
      type: "foreign key",
      name: "fk_player_statistics_match_id",
      references: {
        table: "matches",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // player_statistics.verifiedBy -> users.id
    await queryInterface.addConstraint("player_statistics", {
      fields: ["verifiedBy"],
      type: "foreign key",
      name: "fk_player_statistics_verified_by",
      references: {
        table: "users",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "player_statistics",
      "fk_player_statistics_verified_by"
    );

    await queryInterface.removeConstraint(
      "player_statistics",
      "fk_player_statistics_match_id"
    );

    await queryInterface.removeConstraint(
      "player_statistics",
      "fk_player_statistics_player_id"
    );
  },
};