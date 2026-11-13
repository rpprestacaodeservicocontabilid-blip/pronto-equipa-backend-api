"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint("matchmaking_matches", {
      fields: ["requestId"],
      type: "foreign key",
      name: "fk_matchmaking_matches_request_id",
      references: {
        table: "matchmaking_requests",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    await queryInterface.addConstraint("matchmaking_matches", {
      fields: ["homeTeamId"],
      type: "foreign key",
      name: "fk_matchmaking_matches_home_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    await queryInterface.addConstraint("matchmaking_matches", {
      fields: ["awayTeamId"],
      type: "foreign key",
      name: "fk_matchmaking_matches_away_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    await queryInterface.addConstraint("matchmaking_matches", {
      fields: ["fieldId"],
      type: "foreign key",
      name: "fk_matchmaking_matches_field_id",
      references: {
        table: "fields",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await queryInterface.addConstraint("matchmaking_matches", {
      fields: ["cityId"],
      type: "foreign key",
      name: "fk_matchmaking_matches_city_id",
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
      "matchmaking_matches",
      "fk_matchmaking_matches_city_id",
    );

    await queryInterface.removeConstraint(
      "matchmaking_matches",
      "fk_matchmaking_matches_field_id",
    );

    await queryInterface.removeConstraint(
      "matchmaking_matches",
      "fk_matchmaking_matches_away_team_id",
    );

    await queryInterface.removeConstraint(
      "matchmaking_matches",
      "fk_matchmaking_matches_home_team_id",
    );

    await queryInterface.removeConstraint(
      "matchmaking_matches",
      "fk_matchmaking_matches_request_id",
    );
  },
};