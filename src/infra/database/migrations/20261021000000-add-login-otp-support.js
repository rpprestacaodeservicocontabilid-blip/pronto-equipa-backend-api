'use strict';

/** @type {import('sequelize-cli').Migration} */

module.exports = {
  async up(queryInterface, Sequelize) {
    // ============================================================
    // LOGIN OTP METADATA
    // ============================================================

    await queryInterface.addColumn('auth_verification_tokens', 'attempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('auth_verification_tokens', 'channel', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });

    await queryInterface.addColumn('auth_verification_tokens', 'destination', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    await queryInterface.addIndex('auth_verification_tokens', ['authAccountId', 'type'], {
      name: 'idx_auth_verification_tokens_account_type',
    });

    // ============================================================
    // PHONE AS LOGIN IDENTIFIER
    // ============================================================

    await queryInterface.addIndex('users', ['phone'], {
      name: 'uq_users_phone',
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('users', 'uq_users_phone');

    await queryInterface.removeIndex(
      'auth_verification_tokens',
      'idx_auth_verification_tokens_account_type',
    );

    await queryInterface.removeColumn('auth_verification_tokens', 'destination');

    await queryInterface.removeColumn('auth_verification_tokens', 'channel');

    await queryInterface.removeColumn('auth_verification_tokens', 'attempts');
  },
};
