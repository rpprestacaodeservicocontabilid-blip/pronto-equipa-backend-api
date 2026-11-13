"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint("tournament_stages", {
      fields: ["tournament_id"],
      type: "foreign key",
      name: "fk_tournament_stages_tournament",
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
      "tournament_stages",
      "fk_tournament_stages_tournament"
    );
  },
};