'use strict';

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cities', {
      // ============================================================
      // PRIMARY KEY
      // ============================================================

      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      // ============================================================
      // LOCATION
      // ============================================================

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      state: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      country: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      // ============================================================
      // STATUS
      // ============================================================

      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },

      // ============================================================
      // TIMESTAMPS
      // ============================================================

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // ============================================================
    // INDEXES
    // ============================================================

    await queryInterface.addIndex('cities', ['name'], {
      name: 'idx_cities_name',
    });

    await queryInterface.addIndex('cities', ['state'], {
      name: 'idx_cities_state',
    });

    await queryInterface.addIndex('cities', ['country'], {
      name: 'idx_cities_country',
    });

    await queryInterface.addIndex('cities', ['isActive'], {
      name: 'idx_cities_is_active',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cities');
  },
};
