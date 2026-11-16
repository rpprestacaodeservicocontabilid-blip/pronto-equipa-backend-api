'use strict';

const permissions = [
  ['contracts.read', 'Consultar contratos de trabalho.', 'contracts', 'read'],
  ['contracts.create', 'Criar contratos em rascunho.', 'contracts', 'create'],
  ['contracts.update', 'Actualizar contratos em rascunho.', 'contracts', 'update'],
  ['contracts.submit', 'Submeter contratos para aprovação.', 'contracts', 'submit'],
  ['contracts.approve', 'Aprovar contratos de trabalho.', 'contracts', 'approve'],
  ['contracts.reject', 'Rejeitar contratos de trabalho.', 'contracts', 'reject'],
  ['contracts.activate', 'Activar contratos aprovados.', 'contracts', 'activate'],
  ['contracts.renew', 'Renovar contratos de trabalho.', 'contracts', 'renew'],
  ['contracts.amend', 'Criar adendas contratuais.', 'contracts', 'amend'],
  ['contracts.suspend', 'Suspender contratos.', 'contracts', 'suspend'],
  ['contracts.resume', 'Levantar suspensões contratuais.', 'contracts', 'resume'],
  ['contracts.terminate', 'Registar cessação de contratos.', 'contracts', 'terminate'],
  ['contracts.archive', 'Arquivar contratos encerrados.', 'contracts', 'archive'],
  ['contracts.documents.read', 'Consultar documentos contratuais.', 'contracts.documents', 'read'],
  [
    'contracts.documents.manage',
    'Associar documentos contratuais.',
    'contracts.documents',
    'manage',
  ],
  [
    'contracts.history.read',
    'Consultar versões e histórico contratual.',
    'contracts.history',
    'read',
  ],
  ['contracts.export', 'Exportar informação contratual autorizada.', 'contracts', 'export'],
  [
    'contracts.types.manage',
    'Configurar modalidades contratuais da empresa.',
    'contracts.types',
    'manage',
  ],
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
