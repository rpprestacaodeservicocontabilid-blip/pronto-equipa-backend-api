'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('auth_verification_tokens', 'type', {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: 'EMAIL_VERIFICATION',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('auth_verification_tokens', 'type');
  },
};
