'use strict';
module.exports = {
  async up(q, S) {
    await q.createTable('onboarding_resources', {
      id: { type: S.UUID, primaryKey: true, allowNull: false },
      applicationId: {
        type: S.UUID,
        allowNull: false,
        references: { model: 'onboarding_applications', key: 'id' },
        onDelete: 'RESTRICT',
      },
      kind: { type: S.STRING(40), allowNull: false },
      key: { type: S.STRING(240), allowNull: false },
      status: { type: S.STRING(40), allowNull: false },
      data: { type: S.JSON, allowNull: false },
      createdAt: { type: S.DATE, allowNull: false },
      updatedAt: { type: S.DATE, allowNull: false },
    });
    await q.addIndex('onboarding_resources', ['applicationId', 'kind', 'key'], { unique: true });
    await q.addIndex('onboarding_resources', ['kind', 'status']);
  },
  async down(q) {
    await q.dropTable('onboarding_resources');
  },
};
