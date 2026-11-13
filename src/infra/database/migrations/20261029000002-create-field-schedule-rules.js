'use strict';
module.exports = {
  async up(q, S) { await q.sequelize.transaction(async (transaction) => {
    const fieldId = { type: S.INTEGER, allowNull: false, references: { model: 'fields', key: 'id' }, onDelete: 'RESTRICT' };
    await q.createTable('field_schedule_settings', { fieldId: { ...fieldId, primaryKey: true }, weeklyEnabled: { type: S.BOOLEAN, allowNull: false }, weekly: { type: S.JSON, allowNull: false }, onlineEnabled: { type: S.BOOLEAN, allowNull: false }, availabilityMode: { type: S.STRING(16), allowNull: false }, durationMinutes: { type: S.INTEGER, allowNull: true }, gapMinutes: { type: S.INTEGER, allowNull: false }, revision: { type: S.INTEGER, allowNull: false }, updatedBy: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT' }, updatedAt: { type: S.DATE, allowNull: false } }, { transaction });
    await q.createTable('field_schedule_exceptions', { id: { type: S.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false }, fieldId, date: { type: S.DATEONLY, allowNull: false }, closed: { type: S.BOOLEAN, allowNull: false }, opensAt: { type: S.STRING(5), allowNull: true }, closesAt: { type: S.STRING(5), allowNull: true }, note: { type: S.STRING(1000), allowNull: false }, revision: { type: S.INTEGER, allowNull: false } }, { transaction });
    await q.addIndex('field_schedule_exceptions', ['fieldId', 'date'], { unique: true, transaction });
    await q.createTable('field_booking_rules', { bookingId: { type: S.INTEGER, primaryKey: true, allowNull: false, references: { model: 'bookings', key: 'id' }, onDelete: 'RESTRICT' }, gapMinutes: { type: S.INTEGER, allowNull: false }, durationMinutes: { type: S.INTEGER, allowNull: true }, scheduleRevision: { type: S.INTEGER, allowNull: false } }, { transaction });
  }); },
  async down(q) { await q.sequelize.transaction(async (transaction) => { for (const name of ['field_booking_rules', 'field_schedule_exceptions', 'field_schedule_settings']) await q.dropTable(name, { transaction }); }); },
};
