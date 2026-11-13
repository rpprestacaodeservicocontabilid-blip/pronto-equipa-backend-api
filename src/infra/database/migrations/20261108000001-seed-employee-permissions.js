'use strict';

/**
 * Employee permission catalog; no role is granted these permissions automatically.
 *
 * @type {import('sequelize-cli').Migration}
 */
const permissions = [
  ['employees.read', 'Consultar trabalhadores.', 'employees', 'read'],
  ['employees.create', 'Registar trabalhadores.', 'employees', 'create'],
  ['employees.update', 'Actualizar dados não sensíveis de trabalhadores.', 'employees', 'update'],
  [
    'employees.personal.read',
    'Consultar dados pessoais de trabalhadores.',
    'employees.personal_info',
    'read',
  ],
  [
    'employees.personal.manage',
    'Gerir dados pessoais de trabalhadores.',
    'employees.personal_info',
    'manage',
  ],
  ['employees.history.read', 'Consultar histórico de trabalhadores.', 'employees.history', 'read'],
  [
    'employees.status.manage',
    'Alterar a situação laboral de trabalhadores.',
    'employees.status',
    'manage',
  ],
  [
    'employees.transfer',
    'Registar alterações profissionais e transferências.',
    'employees.professional_history',
    'manage',
  ],
  [
    'employees.terminate',
    'Registar cessação de vínculo laboral.',
    'employees.termination',
    'manage',
  ],
  ['employees.rehire', 'Registar readmissão de trabalhador.', 'employees.rehire', 'manage'],
  [
    'employees.identifications.read',
    'Consultar documentos de identificação.',
    'employees.identifications',
    'read',
  ],
  [
    'employees.identifications.manage',
    'Gerir documentos de identificação.',
    'employees.identifications',
    'manage',
  ],
  [
    'employees.bank_accounts.read',
    'Consultar dados bancários de trabalhadores.',
    'employees.bank_accounts',
    'read',
  ],
  [
    'employees.bank_accounts.manage',
    'Gerir dados bancários de trabalhadores.',
    'employees.bank_accounts',
    'manage',
  ],
  [
    'employees.dependents.read',
    'Consultar dependentes de trabalhadores.',
    'employees.dependents',
    'read',
  ],
  [
    'employees.dependents.manage',
    'Gerir dependentes de trabalhadores.',
    'employees.dependents',
    'manage',
  ],
  ['employees.import', 'Importar trabalhadores.', 'employees.import', 'manage'],
  ['employees.export', 'Exportar dados autorizados de trabalhadores.', 'employees.export', 'read'],
];

module.exports = {
  async up(queryInterface) {
    const [existingRows] = await queryInterface.sequelize.query('SELECT name FROM permissions');
    const existing = new Set(existingRows.map((row) => row.name));
    const now = new Date();
    const missing = permissions
      .filter(([name]) => !existing.has(name))
      .map(([name, description, resource, action]) => ({
        name,
        description,
        resource,
        action,
        scope: 'TENANT',
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      }));

    if (missing.length) {
      await queryInterface.bulkInsert('permissions', missing);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('permissions', {
      name: permissions.map(([name]) => name),
    });
  },
};
