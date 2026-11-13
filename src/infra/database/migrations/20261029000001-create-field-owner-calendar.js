'use strict';
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      const fieldId = { type: S.INTEGER, allowNull: false, references: { model: 'fields', key: 'id' }, onDelete: 'RESTRICT' };
      const userId = { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT' };
      await q.createTable('field_calendar_windows', { id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false }, fieldId, kind: { type: S.STRING(16), allowNull: false }, startTime: { type: S.DATE, allowNull: false }, endTime: { type: S.DATE, allowNull: false }, note: { type: S.STRING(1000), allowNull: false }, createdBy: userId, createdAt: { type: S.DATE, allowNull: false } }, { transaction });
      await q.addIndex('field_calendar_windows', ['fieldId', 'startTime', 'endTime'], { transaction });
      await q.createTable('field_calendar_booking_details', { bookingId: { type: S.INTEGER, primaryKey: true, allowNull: false, references: { model: 'bookings', key: 'id' }, onDelete: 'RESTRICT' }, teamId: { type: S.INTEGER, allowNull: true, references: { model: 'teams', key: 'id' }, onDelete: 'RESTRICT' }, customerName: { type: S.STRING(255), allowNull: false }, note: { type: S.STRING(1000), allowNull: false }, createdBy: userId, source: { type: S.STRING(16), allowNull: false, defaultValue: 'OWNER' } }, { transaction });
      await q.createTable('field_calendar_activities', { id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false }, fieldId, actorUserId: userId, action: { type: S.STRING(40), allowNull: false }, payload: { type: S.JSON, allowNull: false }, createdAt: { type: S.DATE, allowNull: false } }, { transaction });
      await q.addIndex('field_calendar_activities', ['fieldId', 'id'], { transaction });
      await q.addIndex('bookings', ['fieldId', 'startTime', 'endTime', 'status'], { transaction, name: 'bookings_calendar_overlap' });
    });
  },
  async down(q) { await q.sequelize.transaction(async (transaction) => { await q.removeIndex('bookings', 'bookings_calendar_overlap', { transaction }); for (const table of ['field_calendar_activities', 'field_calendar_booking_details', 'field_calendar_windows']) await q.dropTable(table, { transaction }); }); },
};
