"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * players.id é UUID.
     *
     * player_transfers.playerId foi criado como INTEGER,
     * portanto precisamos alinhar os tipos antes de criar
     * a Foreign Key.
     */
    await queryInterface.changeColumn("player_transfers", "playerId", {
      type: Sequelize.UUID,
      allowNull: false,
    });

    // player_transfers.playerId -> players.id
    await queryInterface.addConstraint("player_transfers", {
      fields: ["playerId"],
      type: "foreign key",
      name: "fk_player_transfers_player_id",
      references: {
        table: "players",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // player_transfers.fromTeamId -> teams.id
    await queryInterface.addConstraint("player_transfers", {
      fields: ["fromTeamId"],
      type: "foreign key",
      name: "fk_player_transfers_from_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });

    // player_transfers.toTeamId -> teams.id
    await queryInterface.addConstraint("player_transfers", {
      fields: ["toTeamId"],
      type: "foreign key",
      name: "fk_player_transfers_to_team_id",
      references: {
        table: "teams",
        field: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "player_transfers",
      "fk_player_transfers_to_team_id"
    );

    await queryInterface.removeConstraint(
      "player_transfers",
      "fk_player_transfers_from_team_id"
    );

    await queryInterface.removeConstraint(
      "player_transfers",
      "fk_player_transfers_player_id"
    );

    // Reverte o tipo original
    await queryInterface.changeColumn(
      "player_transfers",
      "playerId",
      {
        type: Sequelize.INTEGER,
        allowNull: false,
      }
    );
  },
};