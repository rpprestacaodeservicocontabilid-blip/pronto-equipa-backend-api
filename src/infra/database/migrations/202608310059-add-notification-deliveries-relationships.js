"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // notification_deliveries.notification_id -> notifications.id
    await queryInterface.addConstraint("notification_deliveries", {
      fields: ["notification_id"],
      type: "foreign key",
      name: "fk_notification_deliveries_notification_id",
      references: {
        table: "notifications",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "notification_deliveries",
      "fk_notification_deliveries_notification_id"
    );
  },
};