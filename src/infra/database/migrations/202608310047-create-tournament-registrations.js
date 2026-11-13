"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("tournament_registrations", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      tournamentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      teamId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      registeredAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      approvedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      rejectedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      rejectionReason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("tournament_registrations");
  },
};