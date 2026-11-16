'use strict';

/**
 * Seed das roles canónicas do sistema.
 *
 * As roles vivem em duas tabelas (legado de duas migrations):
 * - `roles` (módulo user)
 * - `auth_roles` (módulo auth)
 *
 * Os ids são fixos e iguais nas duas tabelas para que as
 * chaves estrangeiras de `user_roles`/`role_permissions`
 * sejam satisfeitas em ambas.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const roles = [
      { id: 3, name: 'TEAM_OWNER' },
      { id: 4, name: 'FIELD_OWNER' },
      { id: 5, name: 'ORGANIZER' },
      { id: 7, name: 'ADMIN' },
      { id: 8, name: 'SUPER_ADMIN' },
    ];

    await queryInterface.bulkInsert(
      'roles',
      roles.map((role) => ({
        ...role,
        description: null,
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      })),
      {},
    );

    await queryInterface.bulkInsert(
      'auth_roles',
      roles.map((role) => ({
        ...role,
        description: null,
        createdAt: now,
        updatedAt: now,
      })),
      {},
    );
  },

  async down(queryInterface, Sequelize) {
    const names = ['TEAM_OWNER', 'FIELD_OWNER', 'ORGANIZER', 'ADMIN', 'SUPER_ADMIN'];

    await queryInterface.bulkDelete('roles', { name: { [Sequelize.Op.in]: names } }, {});

    await queryInterface.bulkDelete('auth_roles', { name: { [Sequelize.Op.in]: names } }, {});
  },
};
