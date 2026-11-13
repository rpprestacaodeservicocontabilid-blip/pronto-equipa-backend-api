"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // notification_devices.user_id -> users.id
    await queryInterface.addConstraint("notification_devices", {
      fields: ["user_id"],
      type: "foreign key",
      name: "fk_notification_devices_user_id",
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
      "notification_devices",
      "fk_notification_devices_user_id"
    );
  },
};