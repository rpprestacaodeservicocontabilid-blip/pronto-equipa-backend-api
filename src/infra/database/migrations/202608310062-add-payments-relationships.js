"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // payments.userId -> users.id
    await queryInterface.addConstraint("payments", {
      fields: ["userId"],
      type: "foreign key",
      name: "fk_payments_user_id",
      references: {
        table: "users",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // payments.cityId -> cities.id
    await queryInterface.addConstraint("payments", {
      fields: ["cityId"],
      type: "foreign key",
      name: "fk_payments_city_id",
      references: {
        table: "cities",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // payments.teamId -> teams.id
    await queryInterface.addConstraint("payments", {
      fields: ["teamId"],
      type: "foreign key",
      name: "fk_payments_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    // payments.tournamentId -> tournaments.id
    await queryInterface.addConstraint("payments", {
      fields: ["tournamentId"],
      type: "foreign key",
      name: "fk_payments_tournament_id",
      references: {
        table: "tournaments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    // payments.matchId -> matches.id
    await queryInterface.addConstraint("payments", {
      fields: ["matchId"],
      type: "foreign key",
      name: "fk_payments_match_id",
      references: {
        table: "matches",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "payments",
      "fk_payments_match_id"
    );

    await queryInterface.removeConstraint(
      "payments",
      "fk_payments_tournament_id"
    );

    await queryInterface.removeConstraint(
      "payments",
      "fk_payments_team_id"
    );

    await queryInterface.removeConstraint(
      "payments",
      "fk_payments_city_id"
    );

    await queryInterface.removeConstraint(
      "payments",
      "fk_payments_user_id"
    );
  },
};