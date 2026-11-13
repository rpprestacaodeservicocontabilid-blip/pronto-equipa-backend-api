'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('player_transfers', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      playerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      fromTeamId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      toTeamId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      status: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      contractType: {
        type: Sequelize.STRING,
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

      transferFee: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },

      salary: {
        type: Sequelize.FLOAT,
        allowNull: true,
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

    // Índices para consultas frequentes
    await queryInterface.addIndex('player_transfers', ['playerId'], {
      name: 'idx_player_transfers_player_id',
    });

    await queryInterface.addIndex('player_transfers', ['fromTeamId'], {
      name: 'idx_player_transfers_from_team_id',
    });

    await queryInterface.addIndex('player_transfers', ['toTeamId'], {
      name: 'idx_player_transfers_to_team_id',
    });

    await queryInterface.addIndex('player_transfers', ['status'], {
      name: 'idx_player_transfers_status',
    });

    await queryInterface.addIndex(
      'player_transfers',
      ['playerId', 'startDate'],
      {
        name: 'idx_player_transfers_player_start_date',
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('player_transfers');
  },
};