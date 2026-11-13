'use strict';

/**
 * Authorization permission catalog.
 *
 * This migration registers permissions only; it deliberately does not
 * assign them to roles. Role grants remain an explicit, audited operation.
 *
 * @type {import('sequelize-cli').Migration}
 */
const permissions = [
  ['payroll.read', 'Consultar informação salarial.', 'payroll', 'read', 'TENANT'],
  ['payroll.prepare', 'Preparar processamento salarial.', 'payroll', 'prepare', 'TENANT'],
  ['payroll.approve', 'Aprovar processamento salarial.', 'payroll', 'approve', 'TENANT'],
  ['payroll.review', 'Rever processamento salarial.', 'payroll', 'review', 'TENANT'],
  [
    'authorization.roles.read',
    'Consultar papéis da empresa.',
    'authorization.roles',
    'read',
    'TENANT',
  ],
  [
    'authorization.roles.manage',
    'Criar, alterar e desactivar papéis da empresa.',
    'authorization.roles',
    'manage',
    'TENANT',
  ],
  [
    'authorization.roles.assign',
    'Atribuir papéis a membros da empresa.',
    'authorization.roles',
    'assign',
    'TENANT',
  ],
  [
    'authorization.roles.revoke',
    'Revogar papéis de membros da empresa.',
    'authorization.roles',
    'revoke',
    'TENANT',
  ],
  [
    'authorization.permissions.read',
    'Consultar permissões disponíveis para a empresa.',
    'authorization.permissions',
    'read',
    'TENANT',
  ],
  [
    'platform.companies.read',
    'Consultar empresas na plataforma.',
    'platform.companies',
    'read',
    'PLATFORM',
  ],
  [
    'platform.companies.manage',
    'Gerir adesões e estados das empresas.',
    'platform.companies',
    'manage',
    'PLATFORM',
  ],
  [
    'platform.billing.read',
    'Consultar subscrições e cobrança.',
    'platform.billing',
    'read',
    'PLATFORM',
  ],
  [
    'platform.billing.manage',
    'Gerir subscrições e cobrança.',
    'platform.billing',
    'manage',
    'PLATFORM',
  ],
  [
    'platform.support.read',
    'Consultar informação autorizada para suporte.',
    'platform.support',
    'read',
    'PLATFORM',
  ],
  [
    'platform.audit.read',
    'Consultar registos autorizados da plataforma.',
    'platform.audit',
    'read',
    'PLATFORM',
  ],
  [
    'authorization.platform.roles.read',
    'Consultar papéis administrativos da plataforma.',
    'authorization.platform.roles',
    'read',
    'PLATFORM',
  ],
  [
    'authorization.platform.roles.manage',
    'Gerir papéis administrativos da plataforma.',
    'authorization.platform.roles',
    'manage',
    'PLATFORM',
  ],
  [
    'authorization.platform.roles.assign',
    'Atribuir papéis administrativos da plataforma.',
    'authorization.platform.roles',
    'assign',
    'PLATFORM',
  ],
  [
    'authorization.platform.roles.revoke',
    'Revogar papéis administrativos da plataforma.',
    'authorization.platform.roles',
    'revoke',
    'PLATFORM',
  ],
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert(
      'permissions',
      permissions.map(([name, description, resource, action, scope]) => ({
        name,
        description,
        resource,
        action,
        scope,
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      })),
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('permissions', { name: permissions.map(([name]) => name) });
  },
};
