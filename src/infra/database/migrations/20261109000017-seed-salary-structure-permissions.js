'use strict';

const permissions = [
  ['salary-structure:read', 'Consultar dados da estrutura salarial.', 'salary-structure', 'read'],
  [
    'salary-structure:components:create',
    'Criar componentes salariais.',
    'salary-structure:components',
    'create',
  ],
  [
    'salary-structure:components:update',
    'Actualizar componentes em rascunho.',
    'salary-structure:components',
    'update',
  ],
  [
    'salary-structure:components:publish',
    'Publicar versões de componentes.',
    'salary-structure:components',
    'publish',
  ],
  [
    'salary-structure:components:deactivate',
    'Desactivar componentes salariais.',
    'salary-structure:components',
    'deactivate',
  ],
  [
    'salary-structure:tables:manage',
    'Gerir tabelas e escalões salariais.',
    'salary-structure:tables',
    'manage',
  ],
  [
    'salary-structure:grades:manage',
    'Gerir grades e escalões salariais.',
    'salary-structure:grades',
    'manage',
  ],
  [
    'salary-structure:structures:create',
    'Criar estruturas remuneratórias.',
    'salary-structure:structures',
    'create',
  ],
  [
    'salary-structure:structures:update',
    'Actualizar versões de estruturas remuneratórias.',
    'salary-structure:structures',
    'update',
  ],
  [
    'salary-structure:structures:approve',
    'Aprovar estruturas remuneratórias.',
    'salary-structure:structures',
    'approve',
  ],
  [
    'salary-structure:structures:publish',
    'Publicar estruturas remuneratórias.',
    'salary-structure:structures',
    'publish',
  ],
  [
    'salary-structure:assignments:read',
    'Consultar atribuições salariais.',
    'salary-structure:assignments',
    'read',
  ],
  [
    'salary-structure:assignments:manage',
    'Gerir atribuições salariais.',
    'salary-structure:assignments',
    'manage',
  ],
  [
    'salary-structure:revisions:create',
    'Criar propostas de revisão salarial.',
    'salary-structure:revisions',
    'create',
  ],
  [
    'salary-structure:revisions:read',
    'Consultar revisões salariais.',
    'salary-structure:revisions',
    'read',
  ],
  [
    'salary-structure:revisions:approve',
    'Aprovar ou rejeitar revisões salariais.',
    'salary-structure:revisions',
    'approve',
  ],
  [
    'salary-structure:revisions:apply',
    'Aplicar revisões aprovadas.',
    'salary-structure:revisions',
    'apply',
  ],
  [
    'salary-structure:revisions:batch',
    'Criar e processar lotes de revisão salarial.',
    'salary-structure:revisions',
    'batch',
  ],
  [
    'salary-structure:simulations:run',
    'Simular impacto de alterações salariais.',
    'salary-structure:simulations',
    'run',
  ],
  [
    'salary-structure:reports:read',
    'Consultar relatórios salariais autorizados.',
    'salary-structure:reports',
    'read',
  ],
  [
    'salary-structure:export',
    'Solicitar exportação de relatórios salariais.',
    'salary-structure',
    'export',
  ],
  [
    'salary-structure:history:read',
    'Consultar histórico e snapshots salariais.',
    'salary-structure:history',
    'read',
  ],
  [
    'salary-structure:policies:manage',
    'Gerir políticas salariais empresariais.',
    'salary-structure:policies',
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
