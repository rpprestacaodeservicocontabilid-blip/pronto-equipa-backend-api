'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('player_ratings', {
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

      attribute: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      value: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      ratedBy: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      comment: {
        type: Sequelize.TEXT,
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
    await queryInterface.dropTable('player_ratings');
  },
};