'use strict';

module.exports = {
  async up(q) {
    if (q.sequelize.getDialect() !== 'mysql') return;
    // A view alone still filters INFORMATION_SCHEMA.TRIGGERS using the caller.
    // Read it in a definer function and expose only trigger names via the view.
    await q.sequelize.query('DROP FUNCTION IF EXISTS audit_trigger_names');
    await q.sequelize.query(`
      CREATE FUNCTION audit_trigger_names() RETURNS JSON
      READS SQL DATA SQL SECURITY DEFINER
      RETURN (
        SELECT COALESCE(JSON_ARRAYAGG(TRIGGER_NAME), JSON_ARRAY())
        FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA = DATABASE()
      )
    `);
    await q.sequelize.query(`
      CREATE OR REPLACE SQL SECURITY DEFINER VIEW audit_trigger_inventory AS
      SELECT inventory.name
      FROM JSON_TABLE(audit_trigger_names(), '$[*]' COLUMNS (name VARCHAR(64) PATH '$')) AS inventory
    `);
  },
  async down(q) {
    if (q.sequelize.getDialect() === 'mysql') {
      await q.sequelize.query('DROP VIEW IF EXISTS audit_trigger_inventory');
      await q.sequelize.query('DROP FUNCTION IF EXISTS audit_trigger_names');
    }
  },
};
