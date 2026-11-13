'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('player_histories', {
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

      metadata: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {},
      },

      occurredAt: {
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

      createdAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },

      updatedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    // Índices definidos no Model
    await queryInterface.addIndex('player_histories', ['playerId'], {
      name: 'idx_player_histories_player_id',
    });

    await queryInterface.addIndex('player_histories', ['type'], {
      name: 'idx_player_histories_type',
    });

    await queryInterface.addIndex('player_histories', ['occurredAt'], {
      name: 'idx_player_histories_occurred_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('player_histories');
  },
};
