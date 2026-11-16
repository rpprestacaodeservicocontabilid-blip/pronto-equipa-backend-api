'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ============================================================
    // AUTH PASSWORD RESET TOKENS
    // ============================================================

    await queryInterface.addConstraint('auth_password_reset_tokens', {
      fields: ['authAccountId'],
      type: 'foreign key',
      name: 'fk_password_reset_tokens_auth_account',
      references: {
        table: 'auth_accounts',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // ============================================================
    // AUTH VERIFICATION TOKENS
    // ============================================================

    await queryInterface.addConstraint('auth_verification_tokens', {
      fields: ['authAccountId'],
      type: 'foreign key',
      name: 'fk_verification_tokens_auth_account',
      references: {
        table: 'auth_accounts',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // ============================================================
    // AUTH REFRESH TOKENS
    // ============================================================

    await queryInterface.addConstraint('auth_refresh_tokens', {
      fields: ['authAccountId'],
      type: 'foreign key',
      name: 'fk_refresh_tokens_auth_account',
      references: {
        table: 'auth_accounts',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // ============================================================
    // AUTH SESSIONS → AUTH ACCOUNTS
    // ============================================================

    await queryInterface.addConstraint('auth_sessions', {
      fields: ['authAccountId'],
      type: 'foreign key',
      name: 'fk_sessions_auth_account',
      references: {
        table: 'auth_accounts',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // ============================================================
    // AUTH SESSIONS → REFRESH TOKENS
    // ============================================================

    await queryInterface.addConstraint('auth_sessions', {
      fields: ['refreshTokenId'],
      type: 'foreign key',
      name: 'fk_sessions_refresh_token',
      references: {
        table: 'auth_refresh_tokens',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // ============================================================
    // REFRESH TOKENS → SESSIONS
    // ============================================================

    await queryInterface.addConstraint('auth_refresh_tokens', {
      fields: ['sessionId'],
      type: 'foreign key',
      name: 'fk_refresh_tokens_session',
      references: {
        table: 'auth_sessions',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // ============================================================
    // ROLE PERMISSIONS → ROLES
    // ============================================================

    await queryInterface.addConstraint('role_permissions', {
      fields: ['roleId'],
      type: 'foreign key',
      name: 'fk_role_permissions_role',
      references: {
        table: 'auth_roles',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // ============================================================
    // ROLE PERMISSIONS → PERMISSIONS
    // ============================================================

    await queryInterface.addConstraint('role_permissions', {
      fields: ['permissionId'],
      type: 'foreign key',
      name: 'fk_role_permissions_permission',
      references: {
        table: 'auth_permissions',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // ============================================================
    // USER ROLES → USERS
    // ============================================================

    await queryInterface.addConstraint('user_roles', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'fk_user_roles_user',
      references: {
        table: 'users',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // ============================================================
    // USER ROLES → AUTH ROLES
    // ============================================================

    await queryInterface.addConstraint('user_roles', {
      fields: ['roleId'],
      type: 'foreign key',
      name: 'fk_user_roles_role',
      references: {
        table: 'auth_roles',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    // ============================================================
    // USER ROLES
    // ============================================================

    await queryInterface.removeConstraint('user_roles', 'fk_user_roles_role');

    await queryInterface.removeConstraint('user_roles', 'fk_user_roles_user');

    // ============================================================
    // ROLE PERMISSIONS
    // ============================================================

    await queryInterface.removeConstraint('role_permissions', 'fk_role_permissions_permission');

    await queryInterface.removeConstraint('role_permissions', 'fk_role_permissions_role');

    // ============================================================
    // REFRESH TOKENS / SESSIONS
    // ============================================================

    await queryInterface.removeConstraint('auth_refresh_tokens', 'fk_refresh_tokens_session');

    await queryInterface.removeConstraint('auth_sessions', 'fk_sessions_refresh_token');

    await queryInterface.removeConstraint('auth_sessions', 'fk_sessions_auth_account');

    await queryInterface.removeConstraint('auth_refresh_tokens', 'fk_refresh_tokens_auth_account');

    // ============================================================
    // VERIFICATION / PASSWORD RESET TOKENS
    // ============================================================

    await queryInterface.removeConstraint(
      'auth_verification_tokens',
      'fk_verification_tokens_auth_account',
    );

    await queryInterface.removeConstraint(
      'auth_password_reset_tokens',
      'fk_password_reset_tokens_auth_account',
    );
  },
};
