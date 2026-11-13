"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // tournament_payments.tournament_id -> tournaments.id
    await queryInterface.addConstraint("tournament_payments", {
      fields: ["tournament_id"],
      type: "foreign key",
      name: "fk_tournament_payments_tournament_id",
      references: {
        table: "tournaments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // tournament_payments.team_id -> teams.id
    await queryInterface.addConstraint("tournament_payments", {
      fields: ["team_id"],
      type: "foreign key",
      name: "fk_tournament_payments_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // tournament_payments.registration_id -> tournament_registrations.id
    await queryInterface.addConstraint("tournament_payments", {
      fields: ["registration_id"],
      type: "foreign key",
      name: "fk_tournament_payments_registration_id",
      references: {
        table: "tournament_registrations",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    // tournament_payments.payment_id -> payments.id
    await queryInterface.addConstraint("tournament_payments", {
      fields: ["payment_id"],
      type: "foreign key",
      name: "fk_tournament_payments_payment_id",
      references: {
        table: "payments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "tournament_payments",
      "fk_tournament_payments_payment_id"
    );

    await queryInterface.removeConstraint(
      "tournament_payments",
      "fk_tournament_payments_registration_id"
    );

    await queryInterface.removeConstraint(
      "tournament_payments",
      "fk_tournament_payments_team_id"
    );

    await queryInterface.removeConstraint(
      "tournament_payments",
      "fk_tournament_payments_tournament_id"
    );
  },
};