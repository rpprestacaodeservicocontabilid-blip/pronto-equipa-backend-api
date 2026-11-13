"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint("fields", {
      fields: ["cityId"],
      type: "foreign key",
      name: "fk_fields_city_id",
      references: {
        table: "cities",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "fields",
      "fk_fields_city_id",
    );
  },
};