'use strict';
module.exports = {
  async up(q) {
    const [rows] = await q.sequelize.query("SELECT id FROM permissions WHERE name = 'payslips:employees:link'");
    if (rows.length) return;
    const now = new Date();
    await q.bulkInsert('permissions', [{ name:'payslips:employees:link', description:'Link employee portal identity', resource:'payslips:employees', action:'link', scope:'TENANT', isSystem:true, createdAt:now, updatedAt:now }]);
  },
  async down(q) { await q.bulkDelete('permissions', { name:'payslips:employees:link' }); },
};
