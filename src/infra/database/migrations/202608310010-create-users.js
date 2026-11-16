'use strict';

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },

      phone: {
        type: Sequelize.STRING(30),
        allowNull: true,
      },

      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'PLAYER',
      },

      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },

      profileId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },

      emailVerifiedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },

      lastLoginAt: {
        type: Sequelize.DATE,
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

      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    // ============================================================
    // INDEXES
    // ============================================================

    await queryInterface.addIndex('users', ['status'], {
      name: 'idx_users_status',
    });

    await queryInterface.addIndex('users', ['type'], {
      name: 'idx_users_type',
    });

    await queryInterface.addIndex('users', ['profileId'], {
      name: 'idx_users_profile_id',
    });

    await queryInterface.addIndex('users', ['emailVerifiedAt'], {
      name: 'idx_users_email_verified_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  },
};
