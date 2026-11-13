import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import {
  EmploymentContract,
  EmploymentContractProps,
} from '../../domain/aggregates/employment-contract.aggregate';
import {
  ContractListQuery,
  ContractRepository,
} from '../../domain/repositories/contract.repository';
import { ContractPeriod } from '../../domain/value-objects/contract-period.vo';

type ActorInput = { companyId: number; actorUserId: number };

export class ManageContractsUseCase {
  constructor(
    private readonly repository: ContractRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async create(
    input: ActorInput & {
      employeeId: string;
      contractNumber: string;
      typeCode: string;
      startDate: string;
      endDate: string | null;
      currency: string;
      salaryAmount: string | null;
      terms: Record<string, unknown>;
    },
  ): Promise<EmploymentContractProps> {
    const contract = EmploymentContract.create(input);
    const created = await this.repository.create(contract.props, input.actorUserId);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'contracts.created',
      entityType: 'employment_contract',
      entityId: created.id,
      after: { contractNumber: created.contractNumber, employeeId: created.employeeId },
    });
    return created;
  }

  async list(companyId: number, query: ContractListQuery) {
    return this.repository.list(companyId, query);
  }

  async get(companyId: number, id: string): Promise<EmploymentContractProps> {
    const contract = await this.repository.find(companyId, id);
    if (!contract) {
      const { NotFoundError } = await import('../../../../shared/errors/app.error');
      throw new NotFoundError('Contract');
    }
    return contract;
  }

  async updateDraft(
    input: ActorInput & {
      id: string;
      expectedVersion: number;
      changes: Parameters<ContractRepository['updateDraft']>[3];
    },
  ) {
    const updated = await this.repository.updateDraft(
      input.companyId,
      input.id,
      input.expectedVersion,
      input.changes,
      input.actorUserId,
    );
    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'contracts.draft_updated',
      entityType: 'employment_contract',
      entityId: input.id,
      after: { version: updated.version },
    });
    return updated;
  }

  async transition(
    input: ActorInput & {
      id: string;
      expectedVersion: number;
      status: EmploymentContractProps['status'];
      recordType: string;
      payload?: Record<string, unknown>;
    },
  ) {
    if (input.status === 'TERMINATED' && input.payload?.effectiveDate) {
      const contract = await this.get(input.companyId, input.id);
      const effectiveDate = String(input.payload.effectiveDate);
      ContractPeriod.create(effectiveDate, null);
      if (
        effectiveDate < new Date().toISOString().slice(0, 10) ||
        effectiveDate < contract.startDate
      ) {
        const { ValidationError } = await import('../../../../shared/errors/app.error');
        throw new ValidationError(
          'Termination date cannot be retroactive or precede the contract start.',
        );
      }
    }
    const updated = await this.repository.transition(
      input.companyId,
      input.id,
      input.expectedVersion,
      input.status,
      input.recordType,
      input.actorUserId,
      input.payload,
    );
    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: `contracts.${input.recordType.toLowerCase()}`,
      entityType: 'employment_contract',
      entityId: input.id,
      after: { status: updated.status, version: updated.version },
    });
    return updated;
  }

  async approve(input: ActorInput & { id: string; expectedVersion: number }) {
    const [created] = await this.repository.records(input.companyId, input.id, 'CREATED');
    if (created?.actorUserId === input.actorUserId) {
      const { ForbiddenError } = await import('../../../../shared/errors/app.error');
      throw new ForbiddenError('The contract creator cannot approve the same contract.');
    }
    return this.transition({
      ...input,
      status: 'APPROVED',
      recordType: 'APPROVED',
      payload: { decision: 'APPROVED' },
    });
  }

  async addRecord(
    input: ActorInput & {
      id: string;
      expectedVersion: number;
      recordType: string;
      payload: Record<string, unknown>;
    },
  ) {
    if (input.recordType === 'RENEWAL') {
      const contract = await this.get(input.companyId, input.id);
      if (!contract.endDate || String(input.payload.newEndDate ?? '') <= contract.endDate) {
        const { ValidationError } = await import('../../../../shared/errors/app.error');
        throw new ValidationError('Renewal end date must extend the current contract term.');
      }
      ContractPeriod.create(contract.startDate, String(input.payload.newEndDate));
    }
    if (input.recordType === 'AMENDMENT') {
      const effectiveDate = String(input.payload.effectiveDate ?? '');
      ContractPeriod.create(effectiveDate, null);
      input.payload = {
        ...input.payload,
        changes: {
          ...((input.payload.changes as Record<string, unknown> | undefined) ?? {}),
        },
      };
    }
    if (input.recordType === 'SUSPENSION') {
      const contract = await this.get(input.companyId, input.id);
      const startDate = String(input.payload.startDate ?? '');
      const endDate = input.payload.endDate ? String(input.payload.endDate) : null;
      ContractPeriod.create(startDate, endDate);
      const today = new Date().toISOString().slice(0, 10);
      if (startDate > today || startDate < contract.startDate) {
        const { ValidationError } = await import('../../../../shared/errors/app.error');
        throw new ValidationError('Suspension must start within the effective contract period.');
      }
    }
    const updated = await this.repository.addRecord(
      input.companyId,
      input.id,
      input.expectedVersion,
      input.recordType,
      input.actorUserId,
      input.payload,
    );
    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: `contracts.${input.recordType.toLowerCase()}`,
      entityType: 'employment_contract',
      entityId: input.id,
      after: { version: updated.version, ...input.payload },
    });
    return updated;
  }

  records(companyId: number, id: string, type?: string) {
    return this.repository.records(companyId, id, type);
  }

  async createType(
    input: ActorInput & {
      code: string;
      name: string;
      legalRuleVersionId: string | null;
      requiresEndDate: boolean;
      maxRenewals: number | null;
      active: boolean;
    },
  ) {
    const type = await this.repository.createType(input.companyId, input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: 'contracts.type_created',
      entityType: 'contract_type',
      entityId: type.id,
      after: { code: type.code, requiresEndDate: type.requiresEndDate },
    });
    return type;
  }

  types(companyId: number) {
    return this.repository.listTypes(companyId);
  }

  verifyEmployee(companyId: number, employeeId: string) {
    return this.repository.verifyEmployee(companyId, employeeId);
  }

  async assertExists(companyId: number, id: string): Promise<void> {
    await this.get(companyId, id);
  }

  expiring(companyId: number, days: number) {
    return this.repository.list(companyId, {
      page: 1,
      limit: 100,
      status: 'ACTIVE',
      expiringWithinDays: days,
    });
  }
}
