"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint("player_injuries", {
      fields: ["playerId"],
      type: "foreign key",
      name: "fk_player_injuries_player_id",
      references: {
        table: "players",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "player_injuries",
      "fk_player_injuries_player_id"
    );
  },
};