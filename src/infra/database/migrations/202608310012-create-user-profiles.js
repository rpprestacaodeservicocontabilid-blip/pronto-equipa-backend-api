'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_profiles', {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      userId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        unique: true,
      },

      bio: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      avatar: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },

      birthDate: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },

      address: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      cityId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },

      website: {
        type: Sequelize.STRING(255),
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

    // ============================================================
    // INDEXES
    // ============================================================

    await queryInterface.addIndex('user_profiles', ['cityId'], {
      name: 'idx_user_profiles_city_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_profiles');
  },
};
