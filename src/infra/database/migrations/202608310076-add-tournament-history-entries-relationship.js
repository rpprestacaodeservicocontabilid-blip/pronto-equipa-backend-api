"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // tournament_history_entries.historyId
    // -> tournament_histories.id
    await queryInterface.addConstraint("tournament_history_entries", {
      fields: ["historyId"],
      type: "foreign key",
      name: "fk_tournament_history_entries_history_id",
      references: {
        table: "tournament_histories",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "tournament_history_entries",
      "fk_tournament_history_entries_history_id"
    );
  },
};