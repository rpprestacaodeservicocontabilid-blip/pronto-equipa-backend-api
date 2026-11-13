"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint("user_profiles", {
      fields: ["userId"],
      type: "foreign key",
      name: "fk_user_profiles_user_id",
      references: {
        table: "users",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "user_profiles",
      "fk_user_profiles_user_id",
    );
  },
};