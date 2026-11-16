'use strict';

const permissions = [
  ['organization:read', 'Consultar estrutura organizacional.', 'organization', 'read'],
  ['organization:departments:create', 'Criar departamentos.', 'organization.departments', 'create'],
  [
    'organization:departments:update',
    'Actualizar departamentos.',
    'organization.departments',
    'update',
  ],
  [
    'organization:departments:deactivate',
    'Desactivar departamentos.',
    'organization.departments',
    'deactivate',
  ],
  [
    'organization:hierarchy:manage',
    'Gerir hierarquias departamentais.',
    'organization.hierarchy',
    'manage',
  ],
  [
    'organization:functions:manage',
    'Gerir funções profissionais.',
    'organization.functions',
    'manage',
  ],
  [
    'organization:positions:manage',
    'Gerir cargos organizacionais.',
    'organization.positions',
    'manage',
  ],
  [
    'organization:categories:manage',
    'Gerir categorias profissionais.',
    'organization.categories',
    'manage',
  ],
  [
    'organization:cost-centers:manage',
    'Gerir centros de custo.',
    'organization.cost_centers',
    'manage',
  ],
  [
    'organization:cost-allocations:manage',
    'Gerir afectações percentuais de custo.',
    'organization.cost_allocations',
    'manage',
  ],
  [
    'organization:establishments:manage',
    'Gerir estabelecimentos.',
    'organization.establishments',
    'manage',
  ],
  [
    'organization:calendars:manage',
    'Gerir calendários laborais.',
    'organization.calendars',
    'manage',
  ],
  ['organization:schedules:manage', 'Gerir horários e turnos.', 'organization.schedules', 'manage'],
  [
    'organization:history:read',
    'Consultar histórico da estrutura organizacional.',
    'organization.history',
    'read',
  ],
  [
    'organization:export',
    'Exportar informação organizacional autorizada.',
    'organization',
    'export',
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
