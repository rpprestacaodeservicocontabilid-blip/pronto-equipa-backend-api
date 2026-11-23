'use strict';

module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      await q.createTable('onboarding_policies', {
        id: { type: S.UUID, primaryKey: true, allowNull: false },
        version: { type: S.INTEGER, allowNull: false, unique: true },
        actorId: { type: S.INTEGER, allowNull: false },
        reason: { type: S.TEXT, allowNull: false },
        data: { type: S.JSON, allowNull: false },
        createdAt: { type: S.DATE, allowNull: false },
      }, { transaction });
      const [templates] = await q.sequelize.query(
        `SELECT id, data FROM communication_records WHERE "scopeKey" = 'platform' AND kind = 'TEMPLATE' AND "key" = 'ONBOARDING_STATUS:1'`,
        { transaction },
      );
      for (const template of templates) {
        const content = typeof template.data === 'string' ? JSON.parse(template.data) : template.data;
        if (!Number.isInteger(content.actor)) {
          await q.bulkUpdate('communication_records', {
            data: JSON.stringify({ ...content, actor: 0, publishedBy: content.publishedBy ?? 0 }),
          }, { id: template.id }, { transaction });
        }
      }
    });
  },
  async down(q) {
    await q.dropTable('onboarding_policies');
  },
};

