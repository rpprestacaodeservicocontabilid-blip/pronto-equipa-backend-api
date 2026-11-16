'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint('user_profiles', {
      fields: ['cityId'],
      type: 'foreign key',
      name: 'fk_user_profiles_city_id',
      references: {
        table: 'cities',
        field: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('user_profiles', 'fk_user_profiles_city_id');
  },
};
