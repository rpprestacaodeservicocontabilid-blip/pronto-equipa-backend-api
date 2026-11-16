'use strict';

/**
 * Fase 1 — Fundação multiempresa.
 *
 * Seed do catálogo de permissões do contexto de empresa e ligação
 * às roles canónicas ADMIN e SUPER_ADMIN.
 *
 * Estas permissões são verificadas por empresa (tenant), contra o
 * papel do membro em `company_members.roleId` → `role_permissions`
 * → `permissions`. São idempotentes: podem ser executadas mais do
 * que uma vez sem duplicar registos.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const permissions = [
      {
        name: 'company.read',
        description: 'Consultar dados da empresa.',
        resource: 'company',
        action: 'read',
      },
      {
        name: 'company.update',
        description: 'Alterar dados da empresa.',
        resource: 'company',
        action: 'update',
      },
      {
        name: 'company.members.read',
        description: 'Consultar membros e papéis da empresa.',
        resource: 'company_members',
        action: 'read',
      },
      {
        name: 'company.members.manage',
        description: 'Adicionar, alterar e remover membros da empresa.',
        resource: 'company_members',
        action: 'manage',
      },
      {
        name: 'company.roles.manage',
        description: 'Criar e gerir papéis e permissões da empresa.',
        resource: 'company_roles',
        action: 'manage',
      },
      {
        name: 'audit.read',
        description: 'Consultar o trilho de auditoria da empresa.',
        resource: 'audit_log',
        action: 'read',
      },
    ];

    const names = permissions.map((permission) => permission.name);

    // ============================================================
    // PERMISSÕES (só insere as que ainda não existem)
    // ============================================================

    const [existingRows] = await queryInterface.sequelize.query(
      `SELECT name FROM permissions
        WHERE name IN (${names.map((name) => `'${name}'`).join(', ')})`,
    );

    const existingNames = new Set(existingRows.map((row) => row.name));

    const toInsert = permissions
      .filter((permission) => !existingNames.has(permission.name))
      .map((permission) => ({
        ...permission,
        scope: 'TENANT',
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      }));

    if (toInsert.length > 0) {
      await queryInterface.bulkInsert('permissions', toInsert);
    }

    // ============================================================
    // LIGAÇÃO ROLE → PERMISSÕES (ADMIN, SUPER_ADMIN)
    // ============================================================

    const [roles] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name IN ('ADMIN', 'SUPER_ADMIN')`,
    );

    const [permissionRows] = await queryInterface.sequelize.query(
      `SELECT id FROM permissions
        WHERE name IN (${names.map((name) => `'${name}'`).join(', ')})`,
    );

    const [existingLinks] = await queryInterface.sequelize.query(
      `SELECT roleId, permissionId FROM role_permissions`,
    );

    const existingKeys = new Set(
      existingLinks.map((link) => `${link.roleId}:${link.permissionId}`),
    );

    const links = [];

    for (const role of roles) {
      for (const permission of permissionRows) {
        const key = `${role.id}:${permission.id}`;

        if (existingKeys.has(key)) {
          continue;
        }

        links.push({
          roleId: role.id,
          permissionId: permission.id,
          createdAt: now,
        });
      }
    }

    if (links.length > 0) {
      await queryInterface.bulkInsert('role_permissions', links);
    }
  },

  async down(queryInterface) {
    const names = [
      'company.read',
      'company.update',
      'company.members.read',
      'company.members.manage',
      'company.roles.manage',
      'audit.read',
    ];

    const list = names.map((name) => `'${name}'`).join(', ');

    await queryInterface.sequelize.query(
      `DELETE FROM role_permissions
        WHERE permissionId IN (
          SELECT id FROM permissions WHERE name IN (${list})
        )`,
    );

    await queryInterface.sequelize.query(`DELETE FROM permissions WHERE name IN (${list})`);
  },
};
