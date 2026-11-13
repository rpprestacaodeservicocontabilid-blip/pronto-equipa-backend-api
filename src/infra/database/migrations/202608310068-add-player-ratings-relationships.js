"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // player_ratings.playerId -> players.id
    await queryInterface.addConstraint("player_ratings", {
      fields: ["playerId"],
      type: "foreign key",
      name: "fk_player_ratings_player_id",
      references: {
        table: "players",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // player_ratings.ratedBy -> users.id
    await queryInterface.addConstraint("player_ratings", {
      fields: ["ratedBy"],
      type: "foreign key",
      name: "fk_player_ratings_rated_by",
      references: {
        table: "users",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // player_ratings.verifiedBy -> users.id
    await queryInterface.addConstraint("player_ratings", {
      fields: ["verifiedBy"],
      type: "foreign key",
      name: "fk_player_ratings_verified_by",
      references: {
        table: "users",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "player_ratings",
      "fk_player_ratings_verified_by"
    );

    await queryInterface.removeConstraint(
      "player_ratings",
      "fk_player_ratings_rated_by"
    );

    await queryInterface.removeConstraint(
      "player_ratings",
      "fk_player_ratings_player_id"
    );
  },
};