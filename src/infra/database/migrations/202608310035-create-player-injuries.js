'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('player_injuries', {
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

      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },

      severity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      injuryDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      estimatedRecoveryDate: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      isRecovered: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      recoveredAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      treatmentNotes: {
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
    await queryInterface.dropTable('player_injuries');
  },
};