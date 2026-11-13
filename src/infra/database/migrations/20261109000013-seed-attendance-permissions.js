'use strict';

const permissions = [
  [
    'attendance.punches.create',
    'Registar marcações de assiduidade.',
    'attendance.punches',
    'create',
  ],
  ['attendance.punches.read', 'Consultar marcações de assiduidade.', 'attendance.punches', 'read'],
  [
    'attendance.imports.create',
    'Importar marcações de assiduidade.',
    'attendance.imports',
    'create',
  ],
  [
    'attendance.days.calculate',
    'Apurar o resultado diário de assiduidade.',
    'attendance.days',
    'calculate',
  ],
  ['attendance.days.read', 'Consultar apuramentos diários.', 'attendance.days', 'read'],
  [
    'attendance.occurrences.read',
    'Consultar ocorrências de assiduidade.',
    'attendance.occurrences',
    'read',
  ],
  [
    'attendance.justifications.create',
    'Submeter justificações de ocorrências.',
    'attendance.justifications',
    'create',
  ],
  [
    'attendance.justifications.read',
    'Consultar justificações de assiduidade.',
    'attendance.justifications',
    'read',
  ],
  [
    'attendance.justifications.decide',
    'Decidir justificações de assiduidade.',
    'attendance.justifications',
    'decide',
  ],
  [
    'attendance.corrections.create',
    'Solicitar regularização de marcações.',
    'attendance.corrections',
    'create',
  ],
  [
    'attendance.corrections.read',
    'Consultar regularizações de marcações.',
    'attendance.corrections',
    'read',
  ],
  [
    'attendance.corrections.decide',
    'Decidir regularizações de marcações.',
    'attendance.corrections',
    'decide',
  ],
  ['attendance.periods.read', 'Consultar períodos de assiduidade.', 'attendance.periods', 'read'],
  ['attendance.periods.manage', 'Criar períodos de assiduidade.', 'attendance.periods', 'manage'],
  ['attendance.periods.close', 'Fechar períodos de assiduidade.', 'attendance.periods', 'close'],
  [
    'attendance.policy.manage',
    'Configurar regras versionadas de assiduidade.',
    'attendance.policy',
    'manage',
  ],
  [
    'attendance.reports.read',
    'Consultar mapas e resumos de assiduidade.',
    'attendance.reports',
    'read',
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
