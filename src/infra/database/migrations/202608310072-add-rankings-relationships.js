"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // rankings.teamId -> teams.id
    await queryInterface.addConstraint("rankings", {
      fields: ["teamId"],
      type: "foreign key",
      name: "fk_rankings_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // rankings.tournamentId -> tournaments.id
    await queryInterface.addConstraint("rankings", {
      fields: ["tournamentId"],
      type: "foreign key",
      name: "fk_rankings_tournament_id",
      references: {
        table: "tournaments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // rankings.cityId -> cities.id
    await queryInterface.addConstraint("rankings", {
      fields: ["cityId"],
      type: "foreign key",
      name: "fk_rankings_city_id",
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
      "rankings",
      "fk_rankings_city_id"
    );

    await queryInterface.removeConstraint(
      "rankings",
      "fk_rankings_tournament_id"
    );

    await queryInterface.removeConstraint(
      "rankings",
      "fk_rankings_team_id"
    );
  },
};