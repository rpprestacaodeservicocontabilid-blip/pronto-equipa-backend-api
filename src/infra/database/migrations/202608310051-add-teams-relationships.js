"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint("teams", {
      fields: ["cityId"],
      type: "foreign key",
      name: "fk_teams_city_id",
      references: {
        table: "cities",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    await queryInterface.addConstraint("teams", {
      fields: ["ownerId"],
      type: "foreign key",
      name: "fk_teams_owner_id",
      references: {
        table: "users",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint(
      "teams",
      "fk_teams_owner_id",
    );

    await queryInterface.removeConstraint(
      "teams",
      "fk_teams_city_id",
    );
  },
};