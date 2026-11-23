'use strict';

module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async transaction => {
      const options = { transaction };
      await q.createTable('platform_report_records', {
        id: { type: S.UUID, primaryKey: true, allowNull: false },
        kind: { type: S.STRING(20), allowNull: false },
        ownerId: { type: S.INTEGER, allowNull: false },
        key: { type: S.STRING(150), allowNull: false },
        status: { type: S.STRING(24), allowNull: false },
        dueAt: { type: S.DATE, allowNull: true },
        data: { type: S.JSON, allowNull: false },
        createdAt: { type: S.DATE, allowNull: false },
        updatedAt: { type: S.DATE, allowNull: false },
      }, options);
      await q.addIndex('platform_report_records', ['kind', 'ownerId', 'key'], { ...options, unique: true, name: 'uq_platform_report_operation' });
      await q.addIndex('platform_report_records', ['ownerId', 'kind', 'createdAt'], { ...options, name: 'idx_platform_reports_owner_created' });
      await q.addIndex('platform_report_records', ['kind', 'status', 'dueAt'], { ...options, name: 'idx_platform_reports_due' });
    });
  },
  async down(q) {
    await q.dropTable('platform_report_records');
  },
};
