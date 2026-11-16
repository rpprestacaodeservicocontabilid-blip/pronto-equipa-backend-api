'use strict';

/**
 * Fase 1 — Fundação multiempresa.
 *
 * Tabela `companies`: tenants (empresas) do ProntoEquipas.
 * Todas as tabelas de negócio passarão a referenciar este tenant
 * para garantir isolamento lógico à aplicação (sem RLS — sem PostgreSQL).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('companies', {
      id: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      name: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },

      slug: {
        type: Sequelize.STRING(160),
        allowNull: false,
      },

      nif: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },

      email: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },

      phone: {
        type: Sequelize.STRING(30),
        allowNull: true,
      },

      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },

      timezone: {
        type: Sequelize.STRING(60),
        allowNull: false,
        defaultValue: 'Africa/Luanda',
      },

      locale: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'pt-AO',
      },

      settings: {
        type: Sequelize.JSON,
        allowNull: true,
      },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // ============================================================
    // INDEXES
    // ============================================================

    await queryInterface.addIndex('companies', ['slug'], {
      unique: true,
      name: 'uq_companies_slug',
    });

    await queryInterface.addIndex('companies', ['status'], {
      name: 'idx_companies_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('companies');
  },
};
