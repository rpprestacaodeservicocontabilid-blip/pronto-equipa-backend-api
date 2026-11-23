'use strict';

const table = 'legal_rule_sets';
const oldStatuses = "'DRAFT','IN_REVIEW','APPROVED','PUBLISHED','RETIRED'";
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async transaction => {
      await q.createTable('legal_sources', {
        id: { type: S.UUID, primaryKey: true, allowNull: false },
        reference: { type: S.STRING(120), allowNull: false, unique: true },
        data: { type: S.JSON, allowNull: false },
        createdAt: { type: S.DATE, allowNull: false },
        createdBy: { type: S.INTEGER, allowNull: false },
      }, { transaction });
      await q.addColumn(table, 'governance', { type: S.JSON, allowNull: true }, { transaction });
      await q.addColumn(table, 'rejectedBy', { type: S.INTEGER, allowNull: true }, { transaction });
      await q.addColumn(table, 'rejectedAt', { type: S.DATE, allowNull: true }, { transaction });
      await q.addColumn(table, 'rejectionReason', { type: S.STRING(1000), allowNull: true }, { transaction });
      if (q.sequelize.getDialect() !== 'postgres') return;
      await q.sequelize.query("ALTER TABLE legal_rule_sets DROP CONSTRAINT ck_legal_rule_status, ADD CONSTRAINT ck_legal_rule_status CHECK (status IN (" + oldStatuses + ",'REJECTED'))", { transaction });
      await q.sequelize.query(`CREATE FUNCTION protect_reviewed_legal_governance() RETURNS trigger AS $$
        BEGIN
          IF OLD.status = 'REJECTED'
             OR (NEW.status = 'REJECTED' AND OLD.status <> 'IN_REVIEW')
             OR (OLD.status <> 'DRAFT' AND (
               NEW.governance::text IS DISTINCT FROM OLD.governance::text
               OR NEW.rules::text IS DISTINCT FROM OLD.rules::text
               OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom"
               OR NEW."effectiveTo" IS DISTINCT FROM OLD."effectiveTo"
               OR NEW."sourceReference" IS DISTINCT FROM OLD."sourceReference"
               OR NEW."evidenceReference" IS DISTINCT FROM OLD."evidenceReference"
             )) THEN
            RAISE EXCEPTION 'Reviewed legal rule set contents are immutable';
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql`, { transaction });
      await q.sequelize.query('CREATE TRIGGER legal_governance_immutable BEFORE UPDATE ON legal_rule_sets FOR EACH ROW EXECUTE FUNCTION protect_reviewed_legal_governance()', { transaction });
    });
  },
  async down(q) {
    await q.sequelize.transaction(async transaction => {
      const postgres = q.sequelize.getDialect() === 'postgres';
      if (postgres) {
        await q.sequelize.query('DROP TRIGGER IF EXISTS legal_governance_immutable ON legal_rule_sets', { transaction });
        await q.sequelize.query('DROP FUNCTION IF EXISTS protect_reviewed_legal_governance()', { transaction });
        await q.sequelize.query('ALTER TABLE legal_rule_sets DISABLE TRIGGER legal_rule_sets_immutable', { transaction });
      }
      await q.sequelize.query("UPDATE legal_rule_sets SET status = 'IN_REVIEW' WHERE status = 'REJECTED'", { transaction });
      if (postgres) {
        await q.sequelize.query('ALTER TABLE legal_rule_sets ENABLE TRIGGER legal_rule_sets_immutable', { transaction });
        await q.sequelize.query("ALTER TABLE legal_rule_sets DROP CONSTRAINT ck_legal_rule_status, ADD CONSTRAINT ck_legal_rule_status CHECK (status IN (" + oldStatuses + "))", { transaction });
      }
      for (const name of ['governance', 'rejectedBy', 'rejectedAt', 'rejectionReason']) await q.removeColumn(table, name, { transaction });
      await q.dropTable('legal_sources', { transaction });
    });
  },
};
