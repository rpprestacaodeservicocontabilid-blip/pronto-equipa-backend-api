'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tournament_awards', {
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

      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      player_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      team_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      position: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      score: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      assigned_at: {
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

    // Índices definidos no Model
    await queryInterface.addIndex(
      'tournament_awards',
      ['tournament_id'],
      {
        name: 'idx_tournament_awards_tournament_id',
      },
    );

    await queryInterface.addIndex(
      'tournament_awards',
      ['player_id'],
      {
        name: 'idx_tournament_awards_player_id',
      },
    );

    await queryInterface.addIndex(
      'tournament_awards',
      ['team_id'],
      {
        name: 'idx_tournament_awards_team_id',
      },
    );

    await queryInterface.addIndex(
      'tournament_awards',
      ['tournament_id', 'type'],
      {
        name: 'idx_tournament_awards_tournament_type',
        unique: false,
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tournament_awards');
  },
};