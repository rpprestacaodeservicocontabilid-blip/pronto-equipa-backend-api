"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint("bookings", {
      fields: ["userId"],
      type: "foreign key",
      name: "fk_bookings_user_id",
      references: {
        table: "users",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    await queryInterface.addConstraint("bookings", {
      fields: ["cityId"],
      type: "foreign key",
      name: "fk_bookings_city_id",
      references: {
        table: "cities",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    await queryInterface.addConstraint("bookings", {
      fields: ["fieldId"],
      type: "foreign key",
      name: "fk_bookings_field_id",
      references: {
        table: "fields",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "bookings",
      "fk_bookings_field_id",
    );

    await queryInterface.removeConstraint(
      "bookings",
      "fk_bookings_city_id",
    );

    await queryInterface.removeConstraint(
      "bookings",
      "fk_bookings_user_id",
    );
  },
};