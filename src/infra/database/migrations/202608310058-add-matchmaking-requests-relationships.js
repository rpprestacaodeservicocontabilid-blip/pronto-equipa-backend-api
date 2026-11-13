"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // matchmaking_requests.requesterTeamId -> teams.id
    await queryInterface.addConstraint("matchmaking_requests", {
      fields: ["requesterTeamId"],
      type: "foreign key",
      name: "fk_matchmaking_requests_requester_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // matchmaking_requests.candidateTeamId -> teams.id
    await queryInterface.addConstraint("matchmaking_requests", {
      fields: ["candidateTeamId"],
      type: "foreign key",
      name: "fk_matchmaking_requests_candidate_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // matchmaking_requests.cityId -> cities.id
    await queryInterface.addConstraint("matchmaking_requests", {
      fields: ["cityId"],
      type: "foreign key",
      name: "fk_matchmaking_requests_city_id",
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
      "matchmaking_requests",
      "fk_matchmaking_requests_city_id"
    );

    await queryInterface.removeConstraint(
      "matchmaking_requests",
      "fk_matchmaking_requests_candidate_team_id"
    );

    await queryInterface.removeConstraint(
      "matchmaking_requests",
      "fk_matchmaking_requests_requester_team_id"
    );
  },
};