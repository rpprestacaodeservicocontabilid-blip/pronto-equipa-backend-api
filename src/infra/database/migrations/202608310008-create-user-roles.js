'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_roles', {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      userId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },

      roleId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // ============================================================
    // UNIQUE INDEX
    // ============================================================

    await queryInterface.addIndex('user_roles', ['userId', 'roleId'], {
      unique: true,
      name: 'uq_user_roles_user_role',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_roles');
  },
};
