'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('player_suspensions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },

      playerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
      },

      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      reason: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      startDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      endDate: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      numberOfMatches: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      issuedBy: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },

      matchesServed: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },

      updatedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('player_suspensions');
  },
};