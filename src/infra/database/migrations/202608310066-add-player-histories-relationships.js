"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // player_histories.playerId -> players.id
    await queryInterface.addConstraint("player_histories", {
      fields: ["playerId"],
      type: "foreign key",
      name: "fk_player_histories_player_id",
      references: {
        table: "players",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // player_histories.verifiedBy -> users.id
    await queryInterface.addConstraint("player_histories", {
      fields: ["verifiedBy"],
      type: "foreign key",
      name: "fk_player_histories_verified_by",
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
      "player_histories",
      "fk_player_histories_verified_by"
    );

    await queryInterface.removeConstraint(
      "player_histories",
      "fk_player_histories_player_id"
    );
  },
};