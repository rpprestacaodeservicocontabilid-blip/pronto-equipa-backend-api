'use strict';

module.exports = {
  up(queryInterface, Sequelize) {
    return queryInterface.addColumn('users', 'identityDisabledAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },
  down(queryInterface) {
    return queryInterface.removeColumn('users', 'identityDisabledAt');
  },
};
