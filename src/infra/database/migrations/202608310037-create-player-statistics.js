'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('player_statistics', {
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

      matchId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
      },

      metric: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      value: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },

      recordedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      isVerified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      verifiedBy: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      verifiedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      notes: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '',
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
    await queryInterface.dropTable('player_statistics');
  },
};