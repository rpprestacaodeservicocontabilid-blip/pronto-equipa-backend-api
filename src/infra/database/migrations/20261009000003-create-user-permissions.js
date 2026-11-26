'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_permissions', {
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

      permissionId: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
      },

      assignedBy: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex('user_permissions', ['userId', 'permissionId'], {
      unique: true,
      name: 'uq_user_permissions_user_permission',
    });

    await queryInterface.addConstraint('user_permissions', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'fk_user_permissions_user_id',
      references: {
        table: 'users',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    await queryInterface.addConstraint('user_permissions', {
      fields: ['permissionId'],
      type: 'foreign key',
      name: 'fk_user_permissions_permission_id',
      references: {
        table: 'permissions',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('user_permissions', 'fk_user_permissions_permission_id');

    await queryInterface.removeConstraint('user_permissions', 'fk_user_permissions_user_id');

    await queryInterface.dropTable('user_permissions');
  },
};
