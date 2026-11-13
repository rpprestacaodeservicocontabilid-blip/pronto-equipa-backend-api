'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tournament_disciplines', {
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

      matchId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      playerId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      teamId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      disciplineId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      cardType: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },

      minute: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      suspensionMatches: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      remainingMatches: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      penaltyAmount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
      },

      active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
      },

      liftedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      liftReason: {
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

    // Índices definidos no Model
    await queryInterface.addIndex(
      'tournament_disciplines',
      ['tournamentId'],
      {
        name: 'idx_tournament_disciplines_tournament_id',
      },
    );

    await queryInterface.addIndex(
      'tournament_disciplines',
      ['matchId'],
      {
        name: 'idx_tournament_disciplines_match_id',
      },
    );

    await queryInterface.addIndex(
      'tournament_disciplines',
      ['playerId'],
      {
        name: 'idx_tournament_disciplines_player_id',
      },
    );

    await queryInterface.addIndex(
      'tournament_disciplines',
      ['teamId'],
      {
        name: 'idx_tournament_disciplines_team_id',
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tournament_disciplines');
  },
};



