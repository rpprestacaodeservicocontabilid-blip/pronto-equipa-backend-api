'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tournaments', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },

      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },

      startDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      endDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      rules: {
        type: Sequelize.JSON,
        allowNull: false,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('tournaments', ['name'], {
      name: 'idx_tournaments_name',
    });

    await queryInterface.addIndex('tournaments', ['type'], {
      name: 'idx_tournaments_type',
    });

    await queryInterface.addIndex('tournaments', ['status'], {
      name: 'idx_tournaments_status',
    });

    await queryInterface.addIndex('tournaments', ['startDate'], {
      name: 'idx_tournaments_start_date',
    });

    await queryInterface.addIndex('tournaments', ['endDate'], {
      name: 'idx_tournaments_end_date',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tournaments');
  },
};