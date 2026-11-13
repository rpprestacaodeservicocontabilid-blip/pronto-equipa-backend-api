'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('support_cases', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      type: { type: Sequelize.STRING(32), allowNull: false },
      status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'OPEN' },
      priority: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'NORMAL' },
      subject: { type: Sequelize.STRING(180), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: false },
      classification: { type: Sequelize.STRING(120), allowNull: true },
      targetType: { type: Sequelize.STRING(32), allowNull: true },
      targetId: { type: Sequelize.STRING(100), allowNull: true },
      evidenceUrl: { type: Sequelize.STRING(2048), allowNull: true },
      createdBy: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      assignedUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      dueAt: { type: Sequelize.DATE, allowNull: true },
      resolutionNote: { type: Sequelize.TEXT, allowNull: true },
      resolvedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      resolvedAt: { type: Sequelize.DATE, allowNull: true },
      closedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      closedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('support_case_activities', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      caseId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'support_cases', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      actorUserId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      action: { type: Sequelize.STRING(32), allowNull: false },
      field: { type: Sequelize.STRING(32), allowNull: true },
      previousValue: { type: Sequelize.TEXT, allowNull: true },
      newValue: { type: Sequelize.TEXT, allowNull: true },
      message: { type: Sequelize.TEXT, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('support_cases', ['type', 'status', 'createdAt'], {
      name: 'idx_support_cases_type_status_created',
    });
    await queryInterface.addIndex('support_cases', ['assignedUserId', 'status'], {
      name: 'idx_support_cases_assignee_status',
    });
    await queryInterface.addIndex('support_cases', ['createdBy', 'createdAt'], {
      name: 'idx_support_cases_creator_created',
    });
    await queryInterface.addIndex('support_case_activities', ['caseId', 'createdAt'], {
      name: 'idx_support_case_activities_case_created',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('support_case_activities');
    await queryInterface.dropTable('support_cases');
  },
};
