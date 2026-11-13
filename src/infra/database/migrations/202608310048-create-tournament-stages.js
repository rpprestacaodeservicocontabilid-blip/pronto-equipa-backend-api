"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("tournament_stages", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      tournament_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      order: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      rule: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {},
      },

      started_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex(
      "tournament_stages",
      ["tournament_id", "order"],
      {
        unique: true,
        name: "tournament_stages_tournament_id_order_unique",
      },
    );

    await queryInterface.addIndex(
      "tournament_stages",
      ["tournament_id"],
      {
        name: "tournament_stages_tournament_id",
      },
    );

    await queryInterface.addIndex(
      "tournament_stages",
      ["status"],
      {
        name: "tournament_stages_status",
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable("tournament_stages");
  },
};