'use strict';
module.exports = {
  async up(q, S) {
    await q.createTable('onboarding_applications', {
      id: { type: S.UUID, primaryKey: true, allowNull: false },
      ownerId: {
        type: S.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'RESTRICT',
      },
      operationKey: { type: S.STRING(160), allowNull: false },
      status: { type: S.STRING(40), allowNull: false },
      companyId: {
        type: S.INTEGER,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'RESTRICT',
      },
      version: { type: S.INTEGER, allowNull: false, defaultValue: 1 },
      data: { type: S.JSON, allowNull: false },
      createdAt: { type: S.DATE, allowNull: false },
      updatedAt: { type: S.DATE, allowNull: false },
    });
    await q.addIndex('onboarding_applications', ['ownerId', 'operationKey'], { unique: true });
    await q.addIndex('onboarding_applications', ['status', 'updatedAt']);
    await q.createTable('onboarding_events', {
      id: { type: S.UUID, primaryKey: true, allowNull: false },
      applicationId: {
        type: S.UUID,
        allowNull: false,
        references: { model: 'onboarding_applications', key: 'id' },
        onDelete: 'RESTRICT',
      },
      data: { type: S.JSON, allowNull: false },
      createdAt: { type: S.DATE, allowNull: false },
    });
    await q.addIndex('onboarding_events', ['applicationId', 'createdAt']);
  },
  async down(q) {
    await q.dropTable('onboarding_events');
    await q.dropTable('onboarding_applications');
  },
};
