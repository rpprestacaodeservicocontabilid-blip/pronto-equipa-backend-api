"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // players.teamId -> teams.id
    await queryInterface.addConstraint("players", {
      fields: ["teamId"],
      type: "foreign key",
      name: "fk_players_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // players.cityId -> cities.id
    await queryInterface.addConstraint("players", {
      fields: ["cityId"],
      type: "foreign key",
      name: "fk_players_city_id",
      references: {
        table: "cities",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "players",
      "fk_players_city_id"
    );

    await queryInterface.removeConstraint(
      "players",
      "fk_players_team_id"
    );
  },
};