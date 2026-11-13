"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Equipa da casa
    await queryInterface.addConstraint("matches", {
      fields: ["homeTeamId"],
      type: "foreign key",
      name: "fk_matches_home_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // Equipa visitante
    await queryInterface.addConstraint("matches", {
      fields: ["awayTeamId"],
      type: "foreign key",
      name: "fk_matches_away_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // Campo
    await queryInterface.addConstraint("matches", {
      fields: ["fieldId"],
      type: "foreign key",
      name: "fk_matches_field_id",
      references: {
        table: "fields",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // Cidade
    await queryInterface.addConstraint("matches", {
      fields: ["cityId"],
      type: "foreign key",
      name: "fk_matches_city_id",
      references: {
        table: "cities",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // Torneio
    await queryInterface.addConstraint("matches", {
      fields: ["tournamentId"],
      type: "foreign key",
      name: "fk_matches_tournament_id",
      references: {
        table: "tournaments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "matches",
      "fk_matches_tournament_id",
    );

    await queryInterface.removeConstraint(
      "matches",
      "fk_matches_city_id",
    );

    await queryInterface.removeConstraint(
      "matches",
      "fk_matches_field_id",
    );

    await queryInterface.removeConstraint(
      "matches",
      "fk_matches_away_team_id",
    );

    await queryInterface.removeConstraint(
      "matches",
      "fk_matches_home_team_id",
    );
  },
};