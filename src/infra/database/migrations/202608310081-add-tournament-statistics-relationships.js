"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint("tournament_statistics", {
      fields: ["tournamentId"],
      type: "foreign key",
      name: "fk_tournament_statistics_tournament",
      references: {
        table: "tournaments",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "tournament_statistics",
      "fk_tournament_statistics_tournament"
    );
  },
};