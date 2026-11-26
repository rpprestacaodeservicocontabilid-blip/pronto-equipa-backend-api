'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('role_permissions', {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      roleId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },

      permissionId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // ============================================================
    // INDEX
    // ============================================================

    await queryInterface.addIndex('role_permissions', ['roleId', 'permissionId'], {
      unique: true,
      name: 'uq_role_permissions_role_permission',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('role_permissions');
  },
};
