'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('rankings', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      teamId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      tournamentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      cityId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      played: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      wins: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      draws: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      losses: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      goalsFor: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      goalsAgainst: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      goalDifference: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      points: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },

      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
    });

    await queryInterface.addIndex('rankings', ['teamId'], {
      name: 'idx_rankings_team_id',
    });

    await queryInterface.addIndex('rankings', ['tournamentId'], {
      name: 'idx_rankings_tournament_id',
    });

    await queryInterface.addIndex('rankings', ['cityId'], {
      name: 'idx_rankings_city_id',
    });

    await queryInterface.addIndex('rankings', ['isActive'], {
      name: 'idx_rankings_is_active',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('rankings');
  },
};