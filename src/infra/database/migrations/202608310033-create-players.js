"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("players", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      fullName: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      nickname: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },

      birthDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      position: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      jerseyNumber: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      teamId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      cityId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      avatar: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      attack: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 50,
      },

      defense: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 50,
      },

      passing: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 50,
      },

      speed: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 50,
      },

      stamina: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 50,
      },

      matchesPlayed: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      goals: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      assists: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      yellowCards: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      redCards: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      cleanSheets: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      mvpAwards: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      minutesPlayed: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },

      isCaptain: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },

      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex(
      "players",
      ["teamId"],
      {
        name: "idx_players_team",
      }
    );

    await queryInterface.addIndex(
      "players",
      ["cityId"],
      {
        name: "idx_players_city",
      }
    );

    await queryInterface.addIndex(
      "players",
      ["position"],
      {
        name: "idx_players_position",
      }
    );

    await queryInterface.addIndex(
      "players",
      ["isActive"],
      {
        name: "idx_players_active",
      }
    );

    await queryInterface.addIndex(
      "players",
      ["teamId", "isActive"],
      {
        name: "idx_players_team_active",
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("players");
  },
};