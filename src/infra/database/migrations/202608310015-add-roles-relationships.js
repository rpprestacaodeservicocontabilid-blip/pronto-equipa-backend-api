'use strict';

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    // ============================================================
    // USER_ROLES → USERS
    // ============================================================

    await queryInterface.addConstraint('user_roles', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'fk_user_roles_user_id',
      references: {
        table: 'users',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // ============================================================
    // USER_ROLES → ROLES
    // ============================================================

    await queryInterface.addConstraint('user_roles', {
      fields: ['roleId'],
      type: 'foreign key',
      name: 'fk_user_roles_role_id',
      references: {
        table: 'roles',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // ============================================================
    // ROLE_PERMISSIONS → ROLES
    // ============================================================

    await queryInterface.addConstraint('role_permissions', {
      fields: ['roleId'],
      type: 'foreign key',
      name: 'fk_role_permissions_role_id',
      references: {
        table: 'roles',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // ============================================================
    // ROLE_PERMISSIONS → AUTH_PERMISSIONS
    // ============================================================

    await queryInterface.addConstraint('role_permissions', {
      fields: ['permissionId'],
      type: 'foreign key',
      name: 'fk_role_permissions_permission_id',
      references: {
        table: 'auth_permissions',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('role_permissions', 'fk_role_permissions_permission_id');

    await queryInterface.removeConstraint('role_permissions', 'fk_role_permissions_role_id');

    await queryInterface.removeConstraint('user_roles', 'fk_user_roles_role_id');

    await queryInterface.removeConstraint('user_roles', 'fk_user_roles_user_id');
  },
};
