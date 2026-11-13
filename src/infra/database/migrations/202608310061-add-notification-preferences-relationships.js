"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // notification_preferences.user_id -> users.id
    await queryInterface.addConstraint("notification_preferences", {
      fields: ["user_id"],
      type: "foreign key",
      name: "fk_notification_preferences_user_id",
      references: {
        table: "users",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "notification_preferences",
      "fk_notification_preferences_user_id"
    );
  },
};