"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // player_suspensions.playerId -> players.id
    await queryInterface.addConstraint("player_suspensions", {
      fields: ["playerId"],
      type: "foreign key",
      name: "fk_player_suspensions_player_id",
      references: {
        table: "players",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // player_suspensions.issuedBy -> users.id
    await queryInterface.addConstraint("player_suspensions", {
      fields: ["issuedBy"],
      type: "foreign key",
      name: "fk_player_suspensions_issued_by",
      references: {
        table: "users",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "player_suspensions",
      "fk_player_suspensions_issued_by"
    );

    await queryInterface.removeConstraint(
      "player_suspensions",
      "fk_player_suspensions_player_id"
    );
  },
};