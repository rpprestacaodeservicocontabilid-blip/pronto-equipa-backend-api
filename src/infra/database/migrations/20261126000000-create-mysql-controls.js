'use strict';

const immutableTables = [
  ['loan_ledger_entries', 'Loan ledger entries are immutable'],
  ['salary_snapshots', 'Salary snapshots are immutable'],
  ['payroll_input_snapshots', 'Payroll input snapshots are immutable'],
  ['payroll_closings', 'Payroll closing evidence is immutable'],
  ['payroll_approvals', 'Payroll approval evidence is immutable'],
  ['payroll_calculation_snapshots', 'Payroll calculation snapshots are immutable'],
  ['simulation_scenario_versions', 'Simulation scenario versions are immutable'],
  ['simulation_run_items', 'Simulation run evidence is immutable'],
  ['simulation_approvals', 'Simulation approval evidence is immutable'],
];

module.exports = {
  async up(q) {
    if (q.sequelize.getDialect() !== 'mysql') return;
    const quote = (name) => q.queryGenerator.quoteIdentifier(name);
    const tableExists = async (name) => q.tableExists(name);
    const trigger = async (name, table, event, body) => {
      if (!(await tableExists(table))) return;
      await q.sequelize.query(
        `CREATE TRIGGER IF NOT EXISTS ${quote(name)} BEFORE ${event} ON ${quote(table)} FOR EACH ROW BEGIN ${body} END`,
      );
    };
    const reject = (message) =>
      `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='${message.replace(/'/g, "''")}'`;

    for (const [table, message] of immutableTables) {
      for (const operation of ['UPDATE', 'DELETE']) {
        await trigger(
          `mysql_${table}_${operation.toLowerCase()}_immutable`,
          table,
          operation,
          reject(message) + ';',
        );
      }
    }

    await trigger(
      'mysql_payroll_runs_closed_update',
      'payroll_runs',
      'UPDATE',
      `IF OLD.status='CLOSED' THEN ${reject('Closed payroll runs are immutable')}; END IF;`,
    );
    await trigger(
      'mysql_payroll_runs_closed_delete',
      'payroll_runs',
      'DELETE',
      `IF OLD.status='CLOSED' THEN ${reject('Closed payroll runs are immutable')}; END IF;`,
    );
    for (const table of ['payroll_employee_results', 'payroll_result_lines', 'payroll_adjustments']) {
      for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
        const checkOld = operation !== 'INSERT'
          ? `EXISTS(SELECT 1 FROM payroll_runs WHERE id=OLD.runId AND companyId=OLD.companyId AND status='CLOSED')`
          : 'FALSE';
        const checkNew = operation !== 'DELETE'
          ? `EXISTS(SELECT 1 FROM payroll_runs WHERE id=NEW.runId AND companyId=NEW.companyId AND status='CLOSED')`
          : 'FALSE';
        await trigger(
          `mysql_${table}_${operation.toLowerCase()}_closed`,
          table,
          operation,
          `IF (${checkOld}) OR (${checkNew}) THEN ${reject('Closed payroll results are immutable')}; END IF;`,
        );
      }
    }

    await trigger(
      'mysql_payslips_snapshot_update',
      'payslips',
      'UPDATE',
      `IF NOT (JSON_EXTRACT(OLD.data,'$.snapshot') <=> JSON_EXTRACT(NEW.data,'$.snapshot'))
          OR (JSON_EXTRACT(OLD.data,'$.documentHash') IS NOT NULL AND NOT (JSON_UNQUOTE(JSON_EXTRACT(OLD.data,'$.documentHash')) <=> JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.documentHash'))))
          OR (JSON_EXTRACT(OLD.data,'$.documentStorageKey') IS NOT NULL AND NOT (JSON_UNQUOTE(JSON_EXTRACT(OLD.data,'$.documentStorageKey')) <=> JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.documentStorageKey'))))
        THEN ${reject('Issued payslip snapshots and documents are immutable')}; END IF;`,
    );
    await trigger(
      'mysql_payslips_no_delete',
      'payslips',
      'DELETE',
      reject('Issued payslips are retained') + ';',
    );

    await trigger(
      'mysql_subscription_plan_versions_update',
      'subscription_plan_versions',
      'UPDATE',
      `IF OLD.status='PUBLISHED' THEN ${reject('Published subscription plans are immutable')}; END IF;`,
    );
    await trigger(
      'mysql_subscription_plan_versions_delete',
      'subscription_plan_versions',
      'DELETE',
      `IF OLD.status='PUBLISHED' THEN ${reject('Published subscription plans are immutable')}; END IF;`,
    );

    const contentChanged = [
      'companyId', 'scopeKey', 'ruleSetId', 'version', 'jurisdiction', 'effectiveFrom',
      'effectiveTo', 'sourceReference', 'evidenceReference', 'integrityHash',
    ].map((name) => `NOT (OLD.${quote(name)} <=> NEW.${quote(name)})`);
    contentChanged.push(
      "NOT (CAST(OLD.rules AS CHAR) <=> CAST(NEW.rules AS CHAR))",
      "NOT (CAST(OLD.governance AS CHAR) <=> CAST(NEW.governance AS CHAR))",
    );
    const changedContent = contentChanged.join(' OR ');
    const stateCheck = `
      IF NEW.status NOT IN ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','RETIRED','REJECTED') THEN
        ${reject('Unknown legal rule set status')};
      ELSEIF OLD.status IN ('RETIRED','REJECTED') THEN
        ${reject('Retired or rejected legal rule sets are immutable')};
      ELSEIF (OLD.status='DRAFT' AND NEW.status NOT IN ('DRAFT','IN_REVIEW'))
        OR (OLD.status='IN_REVIEW' AND NEW.status NOT IN ('IN_REVIEW','APPROVED','REJECTED'))
        OR (OLD.status='APPROVED' AND NEW.status NOT IN ('APPROVED','PUBLISHED'))
        OR (OLD.status='PUBLISHED' AND NEW.status NOT IN ('PUBLISHED','RETIRED')) THEN
        ${reject('Invalid legal rule set state transition')};
      ELSEIF OLD.status<>'DRAFT' AND (${changedContent}) THEN
        ${reject('Reviewed legal rule set contents are immutable')};
      END IF;`;
    await trigger('mysql_legal_rule_sets_update', 'legal_rule_sets', 'UPDATE', stateCheck);
    await trigger(
      'mysql_legal_rule_sets_delete',
      'legal_rule_sets',
      'DELETE',
      `IF OLD.status IN ('PUBLISHED','RETIRED','REJECTED') THEN ${reject('Published legal rule sets are immutable')}; END IF;`,
    );
  },

  async down() {
    throw new Error('Security hardening triggers are retained; remove them only in a reviewed maintenance migration.');
  },
};
