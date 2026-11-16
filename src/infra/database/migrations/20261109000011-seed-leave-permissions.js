'use strict';

const permissions = [
  ['leave.accounts.read', 'Consultar contas de férias e saldos.', 'leave.accounts', 'read'],
  [
    'leave.accounts.manage',
    'Gerir contas de férias dos trabalhadores.',
    'leave.accounts',
    'manage',
  ],
  [
    'leave.entitlements.manage',
    'Registar e recalcular direitos adquiridos.',
    'leave.entitlements',
    'manage',
  ],
  [
    'leave.balance.adjust',
    'Ajustar saldos de férias com motivo justificado.',
    'leave.balance',
    'adjust',
  ],
  ['leave.requests.read', 'Consultar pedidos de férias.', 'leave.requests', 'read'],
  ['leave.requests.create', 'Criar pedidos de férias em rascunho.', 'leave.requests', 'create'],
  ['leave.requests.update', 'Actualizar pedidos em rascunho.', 'leave.requests', 'update'],
  [
    'leave.requests.submit',
    'Submeter pedidos de férias para aprovação.',
    'leave.requests',
    'submit',
  ],
  ['leave.requests.approve', 'Aprovar pedidos de férias.', 'leave.requests', 'approve'],
  ['leave.requests.reject', 'Rejeitar pedidos de férias.', 'leave.requests', 'reject'],
  [
    'leave.requests.return',
    'Devolver pedidos de férias para correcção.',
    'leave.requests',
    'return',
  ],
  ['leave.requests.cancel', 'Cancelar pedidos de férias.', 'leave.requests', 'cancel'],
  [
    'leave.requests.manage',
    'Gerir execução de férias (início, conclusão, interrupção, reagendamento).',
    'leave.requests',
    'manage',
  ],
  [
    'leave.planning.read',
    'Consultar calendário, conflitos e ausências de férias.',
    'leave.planning',
    'read',
  ],
  ['leave.reports.read', 'Consultar relatórios de saldos e dias gozados.', 'leave.reports', 'read'],
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
    if (missing.length) await queryInterface.bulkInsert('permissions', missing);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('permissions', { name: permissions.map(([name]) => name) });
  },
};
