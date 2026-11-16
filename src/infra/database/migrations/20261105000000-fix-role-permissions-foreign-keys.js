'use strict';

/**
 * Correção das chaves estrangeiras de `role_permissions`.
 *
 * PROBLEMA
 * -------
 * `202608310011-add-auth-foreign-keys.js` e
 * `202608310015-add-roles-relationships.js` criaram QUATRO foreign
 * keys em `role_permissions`, duas delas duplicadas e apontando para
 * as tabelas erradas:
 *
 *   - `fk_role_permissions_role`         → `auth_roles`     (ERRADA)
 *   - `fk_role_permissions_permission`    → `auth_permissions` (ERRADA)
 *   - `fk_role_permissions_role_id`       → `roles`         (correcta)
 *   - `fk_role_permissions_permission_id` → `auth_permissions` (ERRADA)
 *
 * `auth_permissions` está vazia e as roles/papéis da Fase 1 vivem em
 * `roles`/`permissions`, pelo que qualquer ligação role → permissão
 * falhava com `FOREIGN KEY constraint failed` (o seed
 * `20261106000005-seed-company-permissions` nunca chegou a correr) e
 * os papéis criados por uma empresa (apenas em `roles`) nunca
 * poderiam receber permissões.
 *
 * CORRECÇÃO
 * --------
 *  1. remove as ligações órfãs (referências sem linha em `roles`
 *     ou em `permissions`);
 *  2. remove as três FKs erradas e recria
 *     `fk_role_permissions_permission_id → permissions(id)`;
 *  3. repõe o índice único `uq_role_permissions_role_permission`,
 *     que o rebuild de tabela do SQLite perde (Sequelize reconstrói
 *     a tabela a partir dos campos descritos, sem índices).
 *
 * Em SQLite a desactivação temporária de `foreign_keys` é
 * obrigatória: cada `removeConstraint` reconstrói a tabela e o
 * INSERT de cópia seria validado contra as FKs ainda erradas.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const isSqlite = sequelize.getDialect() === 'sqlite';

    // ============================================================
    // 1. LIGAÇÕES ÓRFÃS
    // ============================================================

    await sequelize.query(
      `DELETE FROM role_permissions
        WHERE NOT EXISTS (
                SELECT 1 FROM roles r WHERE r.id = role_permissions.roleId
              )
           OR NOT EXISTS (
                SELECT 1 FROM permissions p WHERE p.id = role_permissions.permissionId
              )`,
    );

    // ============================================================
    // 2. FOREIGN KEYS
    // ============================================================

    if (isSqlite) {
      await sequelize.query('PRAGMA foreign_keys = OFF');
    }

    try {
      const wrongConstraints = [
        'fk_role_permissions_role',
        'fk_role_permissions_permission',
        'fk_role_permissions_permission_id',
      ];

      for (const name of wrongConstraints) {
        try {
          await queryInterface.removeConstraint('role_permissions', name);
        } catch (error) {
          // Já não existe (corrido noutra base) — segue em frente.
          if (error.name !== 'UnknownConstraintError') {
            throw error;
          }
        }
      }

      await queryInterface.addConstraint('role_permissions', {
        fields: ['permissionId'],
        type: 'foreign key',
        name: 'fk_role_permissions_permission_id',
        references: {
          table: 'permissions',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      });
    } finally {
      if (isSqlite) {
        await sequelize.query('PRAGMA foreign_keys = ON');
      }
    }

    // ============================================================
    // 3. ÍNDICE ÚNICO (perdido nos rebuilds do SQLite)
    // ============================================================

    const indexes = await queryInterface.showIndex('role_permissions');
    const hasUniqueIndex = indexes.some(
      (index) => index.name === 'uq_role_permissions_role_permission',
    );

    if (!hasUniqueIndex) {
      await queryInterface.addIndex('role_permissions', ['roleId', 'permissionId'], {
        name: 'uq_role_permissions_role_permission',
        unique: true,
      });
    }
  },

  /**
   * Rollback best-effort: devolve a FK antiga para `auth_permissions`.
   *
   * As ligações para permissões de `permissions` (inexistentes em
   * `auth_permissions`) são removidas — o estado anterior não as
   * admitiria.
   */
  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const isSqlite = sequelize.getDialect() === 'sqlite';

    if (isSqlite) {
      await sequelize.query('PRAGMA foreign_keys = OFF');
    }

    try {
      try {
        await queryInterface.removeConstraint(
          'role_permissions',
          'fk_role_permissions_permission_id',
        );
      } catch (error) {
        if (error.name !== 'UnknownConstraintError') {
          throw error;
        }
      }

      await sequelize.query(
        `DELETE FROM role_permissions
          WHERE NOT EXISTS (
                  SELECT 1 FROM auth_permissions ap
                   WHERE ap.id = role_permissions.permissionId
                )`,
      );

      await queryInterface.addConstraint('role_permissions', {
        fields: ['permissionId'],
        type: 'foreign key',
        name: 'fk_role_permissions_permission_id',
        references: {
          table: 'auth_permissions',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      });

      await queryInterface.addConstraint('role_permissions', {
        fields: ['roleId'],
        type: 'foreign key',
        name: 'fk_role_permissions_role',
        references: {
          table: 'auth_roles',
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      });
    } finally {
      if (isSqlite) {
        await sequelize.query('PRAGMA foreign_keys = ON');
      }
    }
  },
};
