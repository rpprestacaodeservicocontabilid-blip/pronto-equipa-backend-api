"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // matchmaking_recommendations.teamId -> teams.id
    await queryInterface.addConstraint("matchmaking_recommendations", {
      fields: ["teamId"],
      type: "foreign key",
      name: "fk_matchmaking_recommendations_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // matchmaking_recommendations.candidateTeamId -> teams.id
    await queryInterface.addConstraint("matchmaking_recommendations", {
      fields: ["candidateTeamId"],
      type: "foreign key",
      name: "fk_matchmaking_recommendations_candidate_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // matchmaking_recommendations.cityId -> cities.id
    await queryInterface.addConstraint("matchmaking_recommendations", {
      fields: ["cityId"],
      type: "foreign key",
      name: "fk_matchmaking_recommendations_city_id",
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
      "matchmaking_recommendations",
      "fk_matchmaking_recommendations_city_id"
    );

    await queryInterface.removeConstraint(
      "matchmaking_recommendations",
      "fk_matchmaking_recommendations_candidate_team_id"
    );

    await queryInterface.removeConstraint(
      "matchmaking_recommendations",
      "fk_matchmaking_recommendations_team_id"
    );
  },
};