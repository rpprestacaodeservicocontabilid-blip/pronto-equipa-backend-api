import {
  SimulationPersistencePort,
  SimulationRecord,
  SimulationExportRendererPort,
} from '../ports/simulation-persistence.port';
import {
  RecordStorePort,
  RecordStoreContext,
} from '../../../../shared/application/ports/record-store.port';
import { randomUUID } from 'crypto';

import { hash, cents, money } from '../../../payroll/domain/payroll-result';
import {
  PayrollInputSnapshot,
  PayrollCalculationResult,
} from '../../../payroll/application/ports/payroll-calculator.port';
import { SimulationCalculatorPort, SimulationSourcesPort } from '../ports/simulation.ports';
import {
  AdjustmentOperation,
  ScenarioConfiguration,
  SimulationPeriod,
  SimulationType,
} from '../../domain/simulation.types';

const fail = (message: string, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const moneyPercent = (amount: string, pct: string, operation: 'increase' | 'decrease') => {
  const amountCents = cents(amount);
  const rate = cents(pct);
  const delta = (amountCents * rate + 5000n) / 10000n;
  return money(
    operation === 'increase' ? amountCents + delta : amountCents > delta ? amountCents - delta : 0n,
  );
};
const addMoney = (a: string, b: string) => money(cents(a) + cents(b));
const validPeriod = (period: SimulationPeriod) =>
  /^\d{4}-\d{2}-\d{2}$/.test(period.startDate) &&
  /^\d{4}-\d{2}-\d{2}$/.test(period.endDate) &&
  period.startDate <= period.endDate;

export class SimulationsApplicationService {
  private enqueuer?: (companyId: number, actorUserId: number, runId: string, attempt: number) => Promise<void>;
  constructor(
    private readonly sources: SimulationSourcesPort,
    private readonly calculator: SimulationCalculatorPort,
    private readonly audit: { record(input: any): Promise<void> },
    private readonly persistence: SimulationPersistencePort,
    private readonly renderer: SimulationExportRendererPort,
  ) {}
  setEnqueuer(enqueuer?: (companyId: number, actorUserId: number, runId: string, attempt: number) => Promise<void>) {
    this.enqueuer = enqueuer;
  }

  async createScenario(
    companyId: number,
    actor: number,
    input: { name: string; type: SimulationType; configuration: ScenarioConfiguration },
  ) {
    this.validateConfig(input.configuration);
    const id = randomUUID(),
      now = new Date(),
      data = {
        name: input.name.trim(),
        type: input.type,
        configuration: input.configuration,
        version: 1,
        createdBy: actor,
        updatedBy: actor,
      };
    const scenario = await this.createRecord(
      companyId,
      this.persistence.collections.simulationScenario,
      {
        id,
        companyId,
        status: 'DRAFT',
        runId: null,
        employeeId: null,
        key: `scenario:${id}`,
        version: 1,
        data,
        createdAt: now,
        updatedAt: now,
      },
    );
    await this.createVersion(companyId, id, 1, data, actor);
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'SIMULATION_SCENARIO_CREATED',
      entityType: 'SIMULATION_SCENARIO',
      entityId: id,
      after: { type: input.type, version: 1 },
    });
    return this.presentScenario(scenario);
  }
  async listScenarios(
    companyId: number,
    filters: { status?: string; type?: string; limit?: number },
  ) {
    const rows = await this.findAll(companyId, this.persistence.collections.simulationScenario, {
      where: { companyId, ...(filters.status ? { status: filters.status } : {}),
        ...(filters.type ? { 'data.type': filters.type } : {}) },
      order: [['updatedAt', 'DESC']],
      limit: Math.min(filters.limit || 30, 100),
    });
    return rows.map((row) => this.presentScenario(row));
  }
  async getScenario(companyId: number, id: string) {
    const row = await this.scenario(companyId, id);
    return this.presentScenario(row);
  }
  async updateScenario(
    companyId: number,
    actor: number,
    id: string,
    patch: { name?: string; configuration?: ScenarioConfiguration; expectedVersion?: number },
  ) {
    return this.withTenant(companyId, async (transaction) => {
      const row = await this.persistence.collections.simulationScenario.findOne({
        where: { companyId, id },
        transaction,
        forUpdate: true,
      });
      if (!row) throw fail('Cenário não encontrado.', 404);
      if (!['DRAFT', 'READY', 'REJECTED'].includes(row.status))
        throw fail('Este cenário está bloqueado; crie uma nova versão para continuar.', 409);
      if (patch.expectedVersion !== undefined && row.version !== patch.expectedVersion)
        throw fail('A versão foi alterada por outro utilizador.', 409);
      const nextVersion = row.version + 1;
      const data = {
        ...row.data,
        ...(patch.name ? { name: patch.name.trim() } : {}),
        ...(patch.configuration ? { configuration: patch.configuration } : {}),
        version: nextVersion,
        updatedBy: actor,
      };
      if (patch.configuration) this.validateConfig(patch.configuration);
      await this.persistence.update(
        row,
        { status: 'DRAFT', version: nextVersion, data, updatedAt: new Date() },
        { transaction },
      );
      await this.persistence.collections.simulationScenarioVersion.create(
        {
          id: randomUUID(),
          companyId,
          status: 'IMMUTABLE',
          runId: id,
          employeeId: null,
          key: `version:${id}:${nextVersion}`,
          version: nextVersion,
          data: { ...data, scenarioId: id, createdBy: actor },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { transaction },
      );
      return this.presentScenario(row);
    });
  }
  async duplicateScenario(companyId: number, actor: number, id: string, name?: string) {
    const source = await this.scenario(companyId, id);
    const input = source.data;
    return this.createScenario(companyId, actor, {
      name: name || `${input.name} (cópia)`,
      type: input.type,
      configuration: input.configuration,
    });
  }
  async archiveScenario(companyId: number, actor: number, id: string) {
    return this.withTenant(companyId, async (transaction) => {
      const row = await this.persistence.collections.simulationScenario.findOne({
        where: { companyId, id },
        transaction,
        forUpdate: true,
      });
      if (!row) throw fail('Cenário não encontrado.', 404);
      if (row.status === 'ARCHIVED') return this.presentScenario(row);
      await this.persistence.update(
        row,
        {
          status: 'ARCHIVED',
          data: { ...row.data, archivedAt: new Date().toISOString(), archivedBy: actor },
          updatedAt: new Date(),
        },
        { transaction },
      );
      await this.audit.record({
        companyId,
        actorUserId: actor,
        action: 'SIMULATION_SCENARIO_ARCHIVED',
        entityType: 'SIMULATION_SCENARIO',
        entityId: id,
      });
      return this.presentScenario(row);
    });
  }
  async scenarioVersions(companyId: number, id: string) {
    await this.scenario(companyId, id);
    const rows = await this.findAll(
      companyId,
      this.persistence.collections.simulationScenarioVersion,
      {
        where: { companyId, runId: id },
        order: [['version', 'DESC']],
      },
    );
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      createdAt: row.createdAt,
      ...row.data,
    }));
  }

  async executeScenario(
    companyId: number,
    actor: number,
    id: string,
    input: {
      idempotencyKey: string;
      version?: number;
      employeeIds?: string[];
      period?: SimulationPeriod;
    },
  ) {
    const scenario = await this.scenario(companyId, id);
    if (scenario.status === 'ARCHIVED')
      throw fail('Cenários arquivados não podem ser executados.', 409);
    if (input.version && input.version !== scenario.version)
      throw fail('A versão solicitada já não é a versão actual do cenário.', 409);
    const cfg = scenario.data.configuration as ScenarioConfiguration;
    const period = input.period || cfg.period;
    if (!validPeriod(period)) throw fail('Período de simulação inválido.');
    const requestedIds = input.employeeIds ?? cfg.employeeIds;
    if (requestedIds?.length === 0 || (scenario.data.type === 'INDIVIDUAL_PAYROLL' && requestedIds?.length !== 1))
      throw fail('Seleccione trabalhadores válidos para este cenário.');
    const employeeIds = (await this.sources.selectEmployees(companyId, {
      employeeIds: requestedIds,
      excludeEmployeeIds: cfg.excludeEmployeeIds,
      departmentId: cfg.departmentId,
      jobCategory: cfg.jobCategory,
    })).sort();
    if (!employeeIds.length) throw fail('O cenário não contém trabalhadores activos elegíveis.');
    const isBulk = scenario.data.type === 'BULK_PAYROLL' || requestedIds?.length !== 1;
    const payload = {
      scenarioId: id,
      scenarioVersion: scenario.version,
      type: scenario.data.type,
      executionScope: isBulk ? 'bulk' : 'individual',
      period,
      employeeIds,
      configuration: cfg,
      idempotencyKey: input.idempotencyKey,
      requestHash: hash({ id, version: scenario.version, period, employeeIds, configuration: cfg }),
      attempt: 0,
      requestedBy: actor,
      simulationOnly: true,
    };
    const key = `run:${id}:${input.idempotencyKey}`;
    const store = this.persistence.collections.simulationRun;
    const { run, reused } = await this.withTenant(companyId, async transaction => {
      const existing = await store.findOne({ where: { companyId, key }, transaction });
      if (existing) {
        if (existing.data.requestHash !== payload.requestHash)
          throw fail('A chave de idempotência já foi usada com outros parâmetros.', 409);
        return { run: existing, reused: true };
      }
      const now = new Date();
      const run = await store.create({
        id: randomUUID(), companyId, status: 'PENDING', runId: id, employeeId: null,
        key, version: 1, data: payload, createdAt: now, updatedAt: now,
      }, { transaction });
      return { run, reused: false };
    });
    if (reused) return { ...this.presentRun(run), idempotent: true };
    const runId = run.id;
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'SIMULATION_RUN_REQUESTED',
      entityType: 'SIMULATION_RUN',
      entityId: runId,
      after: { scenarioId: id, employees: employeeIds.length, simulationOnly: true },
    });
    if (isBulk && this.enqueuer) {
      await this.queueRun(companyId, actor, runId, 0);
      return { ...this.presentRun(run), queued: true };
    }
    await this.processRun(companyId, runId);
    return { ...(await this.getRun(companyId, runId)), queued: false };
  }
  async processRun(companyId: number, runId: string) {
    let run = await this.findOne(companyId, this.persistence.collections.simulationRun, {
      where: { companyId, id: runId },
    });
    if (!run || !['PENDING', 'PROCESSING'].includes(run.status)) return;
    const { data } = run;
    const ids: string[] = data.employeeIds || [];
    if (!await this.transitionRun(companyId, runId, run.status, {
      status: 'PROCESSING',
      updatedAt: new Date(),
    })) return;
    for (const employeeId of ids) {
      run = await this.findOne(companyId, this.persistence.collections.simulationRun, {
        where: { companyId, id: runId },
      });
      if (!run || run.status === 'CANCELLED') return;
      const prior = await this.findOne(companyId, this.persistence.collections.simulationRunItem, {
        where: { companyId, runId, employeeId, status: 'COMPLETED' },
        order: [['createdAt', 'DESC']],
      });
      if (prior) continue;
      const attempt = Number(run.data.attempt || 0) + 1;
      const now = new Date();
      try {
        const source = await this.sources.read(
          companyId,
          runId,
          employeeId,
          data.period as SimulationPeriod,
        );
        if (
          source.companyId !== companyId ||
          source.employeeId !== employeeId ||
          source.payrollRunId !== runId
        )
          throw fail('Snapshot de entrada incompatível.', 422);
        const modified = this.applyAdjustments(
          source.data,
          data.configuration as ScenarioConfiguration,
          employeeId,
          data.period as SimulationPeriod,
          runId,
        );
        const input: PayrollInputSnapshot = {
          ...source,
          inputSnapshotId: randomUUID(),
          inputHash: hash({ source, modified, scenarioVersion: data.scenarioVersion, runId }),
          data: modified,
        };
        const result = await this.calculator.calculate(input);
        const itemData = {
          simulationOnly: true,
          inputHash: input.inputHash,
          resultHash: hash(result),
          snapshot: input,
          result,
          attempt,
          engineVersion: result.engineVersion,
          legalRuleSetVersion: result.legalRuleSetVersion,
        };
        await this.createRecord(companyId, this.persistence.collections.simulationRunItem, {
          id: randomUUID(),
          companyId,
          status: 'COMPLETED',
          runId,
          employeeId,
          key: `item:${runId}:${employeeId}:${attempt}`,
          version: attempt,
          data: itemData,
          createdAt: now,
          updatedAt: now,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha no cálculo do trabalhador.';
        await this.createRecord(companyId, this.persistence.collections.simulationRunItem, {
          id: randomUUID(),
          companyId,
          status: 'FAILED',
          runId,
          employeeId,
          key: `item:${runId}:${employeeId}:${attempt}`,
          version: attempt,
          data: {
            simulationOnly: true,
            attempt,
            issue: { code: 'SIMULATION_EMPLOYEE_FAILED', message },
          },
          createdAt: now,
          updatedAt: now,
        });
        await this.createRecord(companyId, this.persistence.collections.simulationIssue, {
          id: randomUUID(),
          companyId,
          status: 'ERROR',
          runId,
          employeeId,
          key: `issue:${runId}:${employeeId}:${attempt}`,
          version: attempt,
          data: { code: 'SIMULATION_EMPLOYEE_FAILED', message, attempt },
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    const items = await this.latestItems(companyId, runId);
    const complete = items.filter((item) => item.status === 'COMPLETED');
    const failed = items.filter((item) => item.status === 'FAILED');
    const totals = complete.reduce(
      (sum, item) => {
        const result = item.data.result as PayrollCalculationResult;
        sum.gross = addMoney(sum.gross, result.grossAmount);
        sum.deductions = addMoney(sum.deductions, result.deductionsAmount);
        sum.net = addMoney(sum.net, result.netAmount);
        sum.employerCosts = addMoney(sum.employerCosts, result.employerCostsAmount);
        return sum;
      },
      { gross: '0.00', deductions: '0.00', net: '0.00', employerCosts: '0.00' },
    );
    const status =
      complete.length === ids.length
        ? 'COMPLETED'
        : complete.length
          ? 'PARTIALLY_COMPLETED'
          : 'FAILED';
    const updated = {
      ...data,
      totals,
      employeeCount: ids.length,
      successfulCount: complete.length,
      failedCount: failed.length,
      completedAt: new Date().toISOString(),
      engineVersions: [...new Set(complete.map((i) => i.data.engineVersion))],
      legalRuleSetVersions: [...new Set(complete.map((i) => i.data.legalRuleSetVersion))],
    };
    if (!await this.transitionRun(companyId, runId, 'PROCESSING', {
      status,
      data: updated,
      updatedAt: new Date(),
    })) return;
    await this.audit.record({
      companyId,
      actorUserId: Number(data.requestedBy),
      action: 'SIMULATION_RUN_FINISHED',
      entityType: 'SIMULATION_RUN',
      entityId: runId,
      after: { status, successful: complete.length, failed: failed.length, simulationOnly: true },
    });
  }
  async listRuns(
    companyId: number,
    options: { scenarioId?: string; status?: string; limit?: number },
  ) {
    const rows = await this.findAll(companyId, this.persistence.collections.simulationRun, {
      where: {
        companyId,
        ...(options.scenarioId ? { runId: options.scenarioId } : {}),
        ...(options.status ? { status: options.status } : {}),
      },
      order: [['createdAt', 'DESC']],
      limit: Math.min(options.limit || 30, 100),
    });
    return rows.map((row) => this.presentRun(row));
  }
  async getRun(companyId: number, id: string) {
    const row = await this.findOne(companyId, this.persistence.collections.simulationRun, {
      where: { companyId, id },
    });
    if (!row) throw fail('Execução de simulação não encontrada.', 404);
    return this.presentRun(row);
  }
  async runProgress(companyId: number, id: string) {
    const run = await this.findOne(companyId, this.persistence.collections.simulationRun, {
      where: { companyId, id },
    });
    if (!run) throw fail('Execução não encontrada.', 404);
    const items = await this.latestItems(companyId, id);
    return {
      id,
      status: run.status,
      total: run.data.employeeCount || run.data.employeeIds?.length || 0,
      completed: items.filter((x: any) => x.status === 'COMPLETED').length,
      failed: items.filter((x: any) => x.status === 'FAILED').length,
      simulationOnly: true,
    };
  }
  async runResults(companyId: number, id: string) {
    const run = await this.findOne(companyId, this.persistence.collections.simulationRun, {
      where: { companyId, id },
    });
    if (!run) throw fail('Execução de simulação não encontrada.', 404);
    const items = await this.latestItems(companyId, id);
    return {
      run: this.presentRun(run),
      items: items.map((item) => ({
        employeeId: item.employeeId,
        status: item.status,
        ...item.data,
      })),
    };
  }
  async retryFailed(companyId: number, actor: number, id: string) {
    const run = await this.findOne(companyId, this.persistence.collections.simulationRun, {
      where: { companyId, id },
    });
    if (!run) throw fail('Execução não encontrada.', 404);
    if (!['FAILED', 'PARTIALLY_COMPLETED'].includes(run.status))
      throw fail('A execução não tem falhas recuperáveis.', 409);
    const data = { ...run.data, attempt: Number(run.data.attempt || 0) + 1, requestedBy: actor };
    if (!await this.transitionRun(companyId, id, run.status, {
      status: 'PENDING',
      data,
      updatedAt: new Date(),
    })) throw fail('O estado da execução mudou. Actualize os dados.', 409);
    if (this.enqueuer) {
      await this.queueRun(companyId, actor, id, data.attempt);
      return { runId: id, status: 'PENDING', queued: true };
    }
    await this.processRun(companyId, id);
    return this.getRun(companyId, id);
  }
  async cancelRun(companyId: number, actor: number, id: string) {
    const run = await this.findOne(companyId, this.persistence.collections.simulationRun, {
      where: { companyId, id },
    });
    if (!run) throw fail('Execução não encontrada.', 404);
    if (!['PENDING', 'PROCESSING', 'VALIDATING'].includes(run.status))
      throw fail('Só é possível cancelar uma execução em curso.', 409);
    if (!await this.transitionRun(companyId, id, run.status, {
      status: 'CANCELLED',
      data: { ...run.data, cancelledAt: new Date().toISOString(), cancelledBy: actor },
      updatedAt: new Date(),
    })) throw fail('O estado da execução mudou. Actualize os dados.', 409);
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'SIMULATION_RUN_CANCELLED',
      entityType: 'SIMULATION_RUN',
      entityId: id,
    });
    return this.getRun(companyId, id);
  }
  async explanation(companyId: number, id: string, employeeId: string) {
    const items = await this.findAll(companyId, this.persistence.collections.simulationRunItem, {
      where: { companyId, runId: id, employeeId, status: 'COMPLETED' },
      order: [['createdAt', 'DESC']],
      limit: 1,
    });
    if (!items.length) throw fail('Resultado detalhado não encontrado.', 404);
    const { data } = items[0];
    return {
      simulationOnly: true,
      employeeId,
      inputHash: data.inputHash,
      resultHash: data.resultHash,
      engineVersion: data.engineVersion,
      legalRuleSetVersion: data.legalRuleSetVersion,
      trace: data.result.calculationTrace,
      lines: data.result.lines,
      snapshot: data.snapshot,
    };
  }

  async compareRuns(
    companyId: number,
    actor: number,
    input: { baseRunId: string; comparedRunId: string },
  ) {
    const base = await this.completedRun(companyId, input.baseRunId),
      compared = await this.completedRun(companyId, input.comparedRunId);
    if (base.id === compared.id) throw fail('Seleccione duas execuções diferentes.');
    const left = await this.latestItems(companyId, base.id),
      right = await this.latestItems(companyId, compared.id);
    const result = this.compareRows(left, right);
    return this.saveComparison(companyId, actor, {
      baseRunId: base.id,
      comparedRunId: compared.id,
      comparison: result,
    });
  }
  async comparePayroll(
    companyId: number,
    actor: number,
    input: { runId: string; payrollRunId: string },
  ) {
    const run = await this.completedRun(companyId, input.runId);
    const actual = await this.sources.officialResults(companyId, input.payrollRunId);
    const sim = await this.latestItems(companyId, run.id);
    const rows = sim
      .filter((x) => x.status === 'COMPLETED')
      .map((item) => ({ employeeId: item.employeeId, ...item.data.result }));
    const result = this.compareRowsRaw(actual as any[], rows);
    return this.saveComparison(companyId, actor, {
      basePayrollRunId: input.payrollRunId,
      comparedRunId: run.id,
      comparison: result,
      comparisonType: 'OFFICIAL_VS_SIMULATED',
    });
  }
  async project(
    companyId: number,
    actor: number,
    runId: string,
    input: {
      months: number;
      monthlyChanges?: Array<{
        month: number;
        salaryIncreasePct?: string;
        headcountDelta?: number;
      }>;
    },
  ) {
    const run = await this.completedRun(companyId, runId);
    if (input.months < 1 || input.months > 36)
      throw fail('A projecção deve ter entre 1 e 36 meses.');
    const { totals } = run.data;
    const changes = (input.monthlyChanges || []).sort((a, b) => a.month - b.month);
    let workforce = Number(run.data.successfulCount || 0),
      factor = '100.00';
    const rows = [] as any[];
    for (let month = 1; month <= input.months; month++) {
      for (const change of changes.filter((c) => c.month === month)) {
        if (change.salaryIncreasePct)
          factor = moneyPercent(factor, change.salaryIncreasePct, 'increase');
        if (change.headcountDelta) workforce = Math.max(0, workforce + change.headcountDelta);
      }
      const ratio = cents(factor),
        baseCount = BigInt(Math.max(1, Number(run.data.successfulCount || 0)));
      const scale = (amount: string) =>
        money((((cents(amount) * ratio) / 10000n) * BigInt(workforce)) / baseCount);
      const gross = scale(totals.gross),
        deductions = scale(totals.deductions),
        net = scale(totals.net),
        employerCosts = scale(totals.employerCosts);
      rows.push({
        month,
        workforce,
        grossAmount: gross,
        deductionsAmount: deductions,
        netAmount: net,
        employerCharges: employerCosts,
        totalPersonnelCost: addMoney(gross, employerCosts),
        currency: 'AOA',
        assumptions: changes.filter((c) => c.month === month),
      });
    }
    const total = rows.reduce(
      (sum, row) => {
        sum.gross = addMoney(sum.gross, row.grossAmount);
        sum.employer = addMoney(sum.employer, row.employerCharges);
        sum.cost = addMoney(sum.cost, row.totalPersonnelCost);
        return sum;
      },
      { gross: '0.00', employer: '0.00', cost: '0.00' },
    );
    const id = randomUUID();
    await this.createRecord(companyId, this.persistence.collections.simulationProjection, {
      id,
      companyId,
      status: 'COMPLETED',
      runId,
      employeeId: null,
      key: `projection:${id}`,
      version: 1,
      data: {
        simulationOnly: true,
        runId,
        months: input.months,
        assumptions: changes,
        periods: rows,
        total,
        createdBy: actor,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { id, simulationOnly: true, runId, periods: rows, total };
  }
  async getProjections(companyId: number, runId: string) {
    const rows = await this.findAll(companyId, this.persistence.collections.simulationProjection, {
      where: { companyId, runId },
      order: [['createdAt', 'DESC']],
    });
    return rows.map((row: any) => ({ id: row.id, ...row.data }));
  }
  async listExports(companyId: number, runId?: string) {
    const rows = await this.findAll(companyId, this.persistence.collections.simulationExport, {
      where: { companyId, ...(runId ? { runId } : {}) },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    return rows.map(row => ({
      id: row.id, runId: row.runId, status: row.status, createdAt: row.createdAt,
      filename: row.data.filename, format: row.data.format, rowCount: row.data.rowCount,
    }));
  }
  async oversight(companyId: number) {
    const { simulationScenario, simulationRun, simulationProposal } = this.persistence.collections;
    return this.withTenant(companyId, async transaction => {
      const counts = async (store: typeof simulationScenario) => {
        const groups = await store.count({ where: { companyId }, group: ['status'], transaction });
        return typeof groups === 'number' ? {} : Object.fromEntries(groups.flatMap(row => row.status ? [[row.status, Number(row.count)]] : []));
      };
      return {
        scenarios: await counts(simulationScenario),
        runs: await counts(simulationRun),
        proposals: await counts(simulationProposal),
      };
    });
  }
  async getExport(companyId: number, id: string) {
    const row = await this.findOne(companyId, this.persistence.collections.simulationExport, {
      where: { companyId, id },
    });
    if (!row) throw fail('Exportação não encontrada.', 404);
    return {
      id: row.id,
      status: row.status,
      ...Object.fromEntries(Object.entries(row.data).filter(([key]) => key !== 'content')),
    };
  }
  async getComparison(companyId: number, id: string) {
    const row = await this.findOne(companyId, this.persistence.collections.simulationComparison, {
      where: { companyId, id },
    });
    if (!row) throw fail('Comparação não encontrada.', 404);
    return { id: row.id, status: row.status, ...row.data };
  }
  async listProposals(companyId: number) {
    const rows = await this.findAll(companyId, this.persistence.collections.simulationProposal, {
      where: { companyId },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    return rows.map((row) => ({ id: row.id, status: row.status, ...row.data }));
  }
  async submitProposal(
    companyId: number,
    actor: number,
    scenarioId: string,
    input: { runId: string; reason: string },
  ) {
    const scenario = await this.scenario(companyId, scenarioId),
      run = await this.completedRun(companyId, input.runId);
    if (run.runId !== scenarioId) throw fail('A execução não pertence ao cenário informado.', 409);
    if (!input.reason.trim()) throw fail('Justificação obrigatória.');
    const id = randomUUID(),
      now = new Date(),
      data = {
        scenarioId,
        scenarioVersion: scenario.version,
        runId: run.id,
        reason: input.reason.trim(),
        submittedBy: actor,
        submittedAt: now.toISOString(),
        simulationOnly: true,
        applied: false,
      };
    const row = await this.createRecord(
      companyId,
      this.persistence.collections.simulationProposal,
      {
        id,
        companyId,
        status: 'SUBMITTED',
        runId: run.id,
        employeeId: null,
        key: `proposal:${id}`,
        version: 1,
        data,
        createdAt: now,
        updatedAt: now,
      },
    );
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'SIMULATION_PROPOSAL_SUBMITTED',
      entityType: 'SIMULATION_PROPOSAL',
      entityId: id,
      after: { scenarioId, runId: run.id },
    });
    return { id, status: row.status, ...data };
  }
  async decideProposal(
    companyId: number,
    actor: number,
    id: string,
    decision: 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED',
    reason: string,
  ) {
    return this.withTenant(companyId, async (transaction) => {
      const proposal = await this.persistence.collections.simulationProposal.findOne({
        where: { companyId, id },
        transaction,
        forUpdate: true,
      });
      if (!proposal) throw fail('Proposta não encontrada.', 404);
      if (proposal.status !== 'SUBMITTED' && proposal.status !== 'UNDER_REVIEW')
        throw fail('A proposta não pode receber nova decisão neste estado.', 409);
      if (Number(proposal.data.submittedBy) === actor)
        throw fail('O proponente não pode decidir a sua própria proposta.', 403);
      if (!reason.trim()) throw fail('Justificação obrigatória.');
      const scenario = await this.persistence.collections.simulationScenario.findOne({
        where: { companyId, id: proposal.data.scenarioId },
        transaction,
        forUpdate: true,
      });
      if (!scenario) throw fail('Cenário da proposta não encontrado.', 404);
      const decisionId = randomUUID(),
        now = new Date();
      const decisionData = {
        proposalId: id,
        actorUserId: actor,
        decision,
        reason: reason.trim(),
        decidedAt: now.toISOString(),
      };
      await this.persistence.collections.simulationApproval.create(
        {
          id: decisionId,
          companyId,
          status: decision,
          runId: id,
          employeeId: null,
          key: `decision:${id}:${actor}`,
          version: 1,
          data: decisionData,
          createdAt: now,
          updatedAt: now,
        },
        { transaction },
      );
      await this.persistence.update(
        proposal,
        {
          status: decision,
          data: { ...proposal.data, lastDecision: decisionData },
          updatedAt: now,
        },
        { transaction },
      );
      if (decision === 'REVISION_REQUESTED') {
        const nextVersion = scenario.version + 1;
        const nextData = {
          ...scenario.data,
          version: nextVersion,
          revisionRequestedAt: now.toISOString(),
          updatedBy: actor,
        };
        await this.persistence.update(
          scenario,
          { status: 'DRAFT', version: nextVersion, data: nextData, updatedAt: now },
          { transaction },
        );
        await this.persistence.collections.simulationScenarioVersion.create(
          {
            id: randomUUID(),
            companyId,
            status: 'IMMUTABLE',
            runId: scenario.id,
            employeeId: null,
            key: `version:${scenario.id}:${nextVersion}`,
            version: nextVersion,
            data: { ...nextData, scenarioId: scenario.id, createdBy: actor },
            createdAt: now,
            updatedAt: now,
          },
          { transaction },
        );
      } else
        await this.persistence.update(
          scenario,
          {
            status: decision,
            data: { ...scenario.data, decision, decidedAt: now.toISOString() },
            updatedAt: now,
          },
          { transaction },
        );
      await this.audit.record({
        companyId,
        actorUserId: actor,
        action: `SIMULATION_PROPOSAL_${decision}`,
        entityType: 'SIMULATION_PROPOSAL',
        entityId: id,
        after: { decision, reason: reason.trim() },
      });
      return { id, status: proposal.status, ...proposal.data };
    });
  }
  async proposal(companyId: number, id: string) {
    const row = await this.findOne(companyId, this.persistence.collections.simulationProposal, {
      where: { companyId, id },
    });
    if (!row) throw fail('Proposta não encontrada.', 404);
    const decisions = await this.findAll(
      companyId,
      this.persistence.collections.simulationApproval,
      {
        where: { companyId, runId: id },
        order: [['createdAt', 'ASC']],
      },
    );
    return { id, status: row.status, ...row.data, decisions: decisions.map((d) => d.data) };
  }
  async exportRun(companyId: number, actor: number, runId: string, format: 'CSV' | 'XLSX' | 'PDF') {
    await this.completedRun(companyId, runId);
    const items = (await this.latestItems(companyId, runId)).filter(
      (i) => i.status === 'COMPLETED',
    );
    const rows = [
      ['SIMULAÇÃO — NÃO É FOLHA OFICIAL'],
      ['Trabalhador', 'Bruto', 'Descontos', 'Líquido', 'Encargos patronais', 'Moeda'],
      ...items.map((item) => {
        const r = item.data.result;
        return [
          item.employeeId || '',
          r.grossAmount,
          r.deductionsAmount,
          r.netAmount,
          r.employerCostsAmount,
          r.currency,
        ];
      }),
    ];
    const content =
      format === 'CSV'
        ? Buffer.from(
            rows
              .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
              .join('\r\n'),
            'utf8',
          )
        : format === 'PDF'
          ? this.renderer.pdf(rows)
          : this.renderer.xlsx(rows);
    const id = randomUUID(),
      filename = `simulation-${runId}.${format.toLowerCase()}`,
      now = new Date();
    await this.createRecord(companyId, this.persistence.collections.simulationExport, {
      id,
      companyId,
      status: 'READY',
      runId,
      employeeId: null,
      key: `export:${id}`,
      version: 1,
      data: {
        simulationOnly: true,
        filename,
        format,
        content: content.toString('base64'),
        createdBy: actor,
        rowCount: items.length,
      },
      createdAt: now,
      updatedAt: now,
    });
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'SIMULATION_EXPORT_CREATED',
      entityType: 'SIMULATION_EXPORT',
      entityId: id,
      after: { runId, format, rowCount: items.length },
    });
    return { id, status: 'READY', simulationOnly: true, filename, rowCount: items.length };
  }
  async downloadExport(companyId: number, actor: number, id: string) {
    const row = await this.findOne(companyId, this.persistence.collections.simulationExport, {
      where: { companyId, id, status: 'READY' },
    });
    if (!row) throw fail('Exportação não encontrada.', 404);
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'SIMULATION_EXPORT_DOWNLOADED',
      entityType: 'SIMULATION_EXPORT',
      entityId: id,
    });
    return {
      filename: String(row.data.filename),
      format: String(row.data.format),
      content: Buffer.from(String(row.data.content), 'base64'),
    };
  }

  private async completedRun(companyId: number, id: string) {
    const run = await this.findOne(companyId, this.persistence.collections.simulationRun, {
      where: { companyId, id },
    });
    if (!run || !['COMPLETED', 'PARTIALLY_COMPLETED'].includes(run.status))
      throw fail('A operação requer uma simulação concluída.', 409);
    return run;
  }
  private async latestItems(companyId: number, runId: string) {
    const all = await this.findAll(companyId, this.persistence.collections.simulationRunItem, {
      where: { companyId, runId },
      order: [['createdAt', 'DESC']],
    });
    const seen = new Set<string>();
    return all.filter((item) => {
      if (!item.employeeId || seen.has(item.employeeId)) return false;
      seen.add(item.employeeId);
      return true;
    });
  }
  private compareRows(left: any[], right: any[]) {
    return this.compareRowsRaw(
      left
        .filter((x) => x.status === 'COMPLETED')
        .map((x) => ({ employeeId: x.employeeId, ...x.data.result })),
      right
        .filter((x) => x.status === 'COMPLETED')
        .map((x) => ({ employeeId: x.employeeId, ...x.data.result })),
    );
  }
  private compareRowsRaw(left: any[], right: any[]) {
    const a = new Map(left.map((r) => [r.employeeId, r])),
      b = new Map(right.map((r) => [r.employeeId, r]));
    const ids = [...new Set([...a.keys(), ...b.keys()])];
    const metrics = ['grossAmount', 'deductionsAmount', 'netAmount', 'employerCostsAmount'];
    return ids.map((employeeId) => {
      const base = a.get(employeeId),
        compared = b.get(employeeId);
      const differences: any = {};
      for (const metric of metrics) {
        const baseValue = base?.[metric] || '0.00',
          comparedValue = compared?.[metric] || '0.00',
          delta = cents(comparedValue) - cents(baseValue);
        differences[metric] = {
          base: baseValue,
          compared: comparedValue,
          difference: money(delta),
          percentage:
            cents(baseValue) === 0n ? null : (Number(delta) * 100) / Number(cents(baseValue)),
        };
      }
      return {
        employeeId,
        affected: metrics.some((metric) => differences[metric].difference !== '0.00'),
        differences,
      };
    });
  }
  private async saveComparison(companyId: number, actor: number, values: Record<string, unknown>) {
    const id = randomUUID(),
      now = new Date();
    const row = await this.createRecord(
      companyId,
      this.persistence.collections.simulationComparison,
      {
        id,
        companyId,
        status: 'COMPLETED',
        runId: String(values.comparedRunId || ''),
        employeeId: null,
        key: `comparison:${id}`,
        version: 1,
        data: { simulationOnly: true, ...values, createdBy: actor, createdAt: now.toISOString() },
        createdAt: now,
        updatedAt: now,
      },
    );
    await this.audit.record({
      companyId,
      actorUserId: actor,
      action: 'SIMULATION_COMPARISON_CREATED',
      entityType: 'SIMULATION_COMPARISON',
      entityId: id,
    });
    return { id, status: row.status, ...row.data };
  }
  private applyAdjustments(
    source: Record<string, unknown>,
    configuration: ScenarioConfiguration,
    employeeId: string,
    period: SimulationPeriod,
    runId: string,
  ): Record<string, unknown> {
    const data = JSON.parse(JSON.stringify(source));
    const segments = Array.isArray(data.segments) ? data.segments : [];
    for (const segment of segments) {
      const salary = segment.salary || {};
      const components = Array.isArray(salary.resolvedComponents) ? salary.resolvedComponents : [];
      for (const adjustment of configuration.adjustments) {
        if (adjustment.employeeId && adjustment.employeeId !== employeeId) continue;
        if (adjustment.effectiveFrom && segment.endDate < adjustment.effectiveFrom) continue;
        if (adjustment.effectiveTo && segment.startDate > adjustment.effectiveTo) continue;
        const code = adjustment.componentCode;
        const found = components.find((component: any) => component.code === code);
        if (found) {
          found.amount = this.adjust(found.amount, adjustment.operation, adjustment.value);
        } else if (adjustment.operation === 'SET' || adjustment.operation === 'ADD') {
          components.push({
            code,
            type: code === 'BASE_SALARY' ? 'BASE_SALARY' : 'EARNING',
            amount: adjustment.operation === 'ADD' ? '0.00' : adjustment.value,
            currency: 'AOA',
            sourceVersionId: `simulation:${runId}:${code}`,
          });
          if (adjustment.operation === 'ADD') {
            const created = components[components.length - 1];
            created.amount = adjustment.value;
          }
        } else
          throw fail(
            `O componente ${code} não existe no snapshot e não pode usar ${adjustment.operation}.`,
          );
      }
      salary.resolvedComponents = components;
      segment.salary = salary;
    }
    if (!segments.length) throw fail('O snapshot salarial não contém segmentos elegíveis.', 422);
    data.segments = segments;
    return data;
  }
  private adjust(amount: string, operation: AdjustmentOperation, value: string) {
    switch (operation) {
      case 'SET':
        return money(cents(value));
      case 'ADD':
        return money(cents(amount) + cents(value));
      case 'SUBTRACT':
        return money(cents(amount) > cents(value) ? cents(amount) - cents(value) : 0n);
      case 'PERCENT_INCREASE':
        return moneyPercent(amount, value, 'increase');
      case 'PERCENT_DECREASE':
        return moneyPercent(amount, value, 'decrease');
    }
  }
  private validateConfig(configuration: ScenarioConfiguration) {
    if (!configuration || !validPeriod(configuration.period))
      throw fail('Cenário requer um período válido.');
    if (!Array.isArray(configuration.adjustments) || configuration.adjustments.length > 200)
      throw fail('Lista de ajustamentos inválida.');
    for (const adjustment of configuration.adjustments) {
      if (
        !/^[A-Z0-9_:-]{2,80}$/.test(adjustment.componentCode) ||
        !['SET', 'ADD', 'SUBTRACT', 'PERCENT_INCREASE', 'PERCENT_DECREASE'].includes(
          adjustment.operation,
        ) ||
        !/^\d{1,12}\.\d{2}$/.test(adjustment.value)
      )
        throw fail('Ajustamento inválido: use código permitido e valor decimal com duas casas.');
      if (
        adjustment.effectiveFrom &&
        adjustment.effectiveTo &&
        adjustment.effectiveFrom > adjustment.effectiveTo
      )
        throw fail('Intervalo de vigência de ajustamento inválido.');
    }
  }
  private async createVersion(
    companyId: number,
    scenarioId: string,
    version: number,
    data: Record<string, unknown>,
    actor: number,
  ) {
    const now = new Date();
    return this.createRecord(companyId, this.persistence.collections.simulationScenarioVersion, {
      id: randomUUID(),
      companyId,
      status: 'IMMUTABLE',
      runId: scenarioId,
      employeeId: null,
      key: `version:${scenarioId}:${version}`,
      version,
      data: { ...data, scenarioId, createdBy: actor },
      createdAt: now,
      updatedAt: now,
    });
  }
  private async scenario(companyId: number, id: string) {
    const row = await this.findOne(companyId, this.persistence.collections.simulationScenario, {
      where: { companyId, id },
    });
    if (!row) throw fail('Cenário não encontrado.', 404);
    return row;
  }
  private presentScenario(row: any) {
    return {
      id: row.id,
      status: row.status,
      ...row.data,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  private presentRun(row: any) {
    return {
      id: row.id,
      scenarioId: row.runId,
      status: row.status,
      ...row.data,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  private async createRecord(
    companyId: number,
    model: RecordStorePort<SimulationRecord>,
    values: any,
  ): Promise<any> {
    return (await this.withTenant(companyId, (transaction) =>
      model.create(values, { transaction }),
    )) as any;
  }
  private async findOne(
    companyId: number,
    model: RecordStorePort<SimulationRecord>,
    options: any,
  ): Promise<any> {
    return (await this.withTenant(companyId, (transaction) =>
      model.findOne({ ...options, transaction }),
    )) as any;
  }
  private async findAll(
    companyId: number,
    model: RecordStorePort<SimulationRecord>,
    options: any,
  ): Promise<any[]> {
    return (await this.withTenant(companyId, (transaction) =>
      model.findAll({ ...options, transaction }),
    )) as any[];
  }
  private transitionRun(
    companyId: number,
    id: string,
    status: string,
    patch: Partial<SimulationRecord>,
  ) {
    return this.withTenant(companyId, transaction => this.persistence.collections.simulationRun.updateWhere(
      patch, { where: { companyId, id, status }, transaction },
    ));
  }
  private async queueRun(companyId: number, actor: number, id: string, attempt: number) {
    try {
      await this.enqueuer?.(companyId, actor, id, attempt);
    } catch (error) {
      await this.transitionRun(companyId, id, 'PENDING', { status: 'FAILED', updatedAt: new Date() });
      throw error;
    }
  }
  private withTenant<T>(
    companyId: number,
    fn: (transaction: RecordStoreContext) => Promise<T>,
  ): Promise<T> {
    return this.persistence.collections.simulationScenario.transaction(companyId, fn);
  }
}
