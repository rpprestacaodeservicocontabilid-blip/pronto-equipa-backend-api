'use strict';

module.exports = {
  async up(q, S) {
    await q.createTable('legal_rule_sets', {
      id: { type: S.UUID, primaryKey: true, allowNull: false },
      companyId: { type: S.INTEGER, allowNull: true, references: { model: 'companies', key: 'id' }, onDelete: 'RESTRICT' },
      scopeKey: { type: S.STRING(40), allowNull: false },
      ruleSetId: { type: S.STRING(100), allowNull: false },
      version: { type: S.STRING(50), allowNull: false },
      jurisdiction: { type: S.STRING(3), allowNull: false, defaultValue: 'AO' },
      effectiveFrom: { type: S.DATEONLY, allowNull: false },
      effectiveTo: { type: S.DATEONLY, allowNull: true },
      sourceReference: { type: S.STRING(500), allowNull: false },
      evidenceReference: { type: S.STRING(1000), allowNull: false },
      rules: { type: S.JSON, allowNull: false },
      integrityHash: { type: S.STRING(64), allowNull: true },
      status: { type: S.STRING(20), allowNull: false, defaultValue: 'DRAFT' },
      createdBy: { type: S.INTEGER, allowNull: false },
      submittedBy: { type: S.INTEGER, allowNull: true },
      submittedAt: { type: S.DATE, allowNull: true },
      approvedBy: { type: S.INTEGER, allowNull: true },
      approvedAt: { type: S.DATE, allowNull: true },
      publishedBy: { type: S.INTEGER, allowNull: true },
      publishedAt: { type: S.DATE, allowNull: true },
      retiredBy: { type: S.INTEGER, allowNull: true },
      retiredAt: { type: S.DATE, allowNull: true },
      createdAt: { type: S.DATE, allowNull: false },
      updatedAt: { type: S.DATE, allowNull: false },
    });
    await q.addIndex('legal_rule_sets', ['scopeKey', 'ruleSetId', 'version'], {
      unique: true, name: 'uq_legal_rule_scope_version',
    });
    await q.addIndex('legal_rule_sets', ['jurisdiction', 'status', 'effectiveFrom', 'effectiveTo'], {
      name: 'ix_legal_rule_resolution',
    });
    await q.addIndex('legal_rule_sets', ['companyId', 'status'], { name: 'ix_legal_rule_company_status' });
    if (q.sequelize.getDialect() === 'postgres') {
      await q.sequelize.query(`ALTER TABLE legal_rule_sets ADD CONSTRAINT ck_legal_rule_effective_dates CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")`);
      await q.sequelize.query(`ALTER TABLE legal_rule_sets ADD CONSTRAINT ck_legal_rule_jurisdiction CHECK (jurisdiction = 'AO')`);
      await q.sequelize.query(`ALTER TABLE legal_rule_sets ADD CONSTRAINT ck_legal_rule_status CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','RETIRED'))`);
      await q.sequelize.query(`CREATE FUNCTION protect_legal_rule_set() RETURNS trigger AS $$
        BEGIN
          IF TG_OP = 'DELETE' THEN
            IF OLD.status IN ('PUBLISHED','RETIRED') THEN RAISE EXCEPTION 'Published legal rule sets are immutable'; END IF;
            RETURN OLD;
          END IF;
          IF OLD.status = 'RETIRED' THEN RAISE EXCEPTION 'Retired legal rule sets are immutable'; END IF;
          IF (NEW.status = 'IN_REVIEW' AND OLD.status <> 'DRAFT') OR
             (NEW.status = 'APPROVED' AND OLD.status <> 'IN_REVIEW') OR
             (NEW.status = 'PUBLISHED' AND OLD.status <> 'APPROVED') OR
             (NEW.status = 'RETIRED' AND OLD.status <> 'PUBLISHED') OR
             (OLD.status = 'RETIRED' AND NEW.status <> 'RETIRED') OR
             (OLD.status = 'PUBLISHED' AND NEW.status NOT IN ('PUBLISHED','RETIRED')) THEN
            RAISE EXCEPTION 'Invalid legal rule set state transition';
          END IF;
          IF OLD.status IN ('PUBLISHED','RETIRED') AND (
             NEW."companyId" IS DISTINCT FROM OLD."companyId" OR NEW."scopeKey" IS DISTINCT FROM OLD."scopeKey" OR
             NEW."ruleSetId" IS DISTINCT FROM OLD."ruleSetId" OR NEW.version IS DISTINCT FROM OLD.version OR
             NEW.jurisdiction IS DISTINCT FROM OLD.jurisdiction OR NEW."effectiveFrom" IS DISTINCT FROM OLD."effectiveFrom" OR
             NEW."effectiveTo" IS DISTINCT FROM OLD."effectiveTo" OR NEW."sourceReference" IS DISTINCT FROM OLD."sourceReference" OR
             NEW."evidenceReference" IS DISTINCT FROM OLD."evidenceReference" OR NEW.rules::text IS DISTINCT FROM OLD.rules::text OR
             NEW."integrityHash" IS DISTINCT FROM OLD."integrityHash") THEN
            RAISE EXCEPTION 'Published legal rule set contents are immutable';
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql`);
      await q.sequelize.query(`CREATE TRIGGER legal_rule_sets_immutable BEFORE UPDATE OR DELETE ON legal_rule_sets FOR EACH ROW EXECUTE FUNCTION protect_legal_rule_set()`);
    }
  },
  async down(q) {
    if (q.sequelize.getDialect() === 'postgres') {
      await q.sequelize.query('DROP TRIGGER IF EXISTS legal_rule_sets_immutable ON legal_rule_sets');
      await q.sequelize.query('DROP FUNCTION IF EXISTS protect_legal_rule_set()');
    }
    await q.dropTable('legal_rule_sets');
  },
};
