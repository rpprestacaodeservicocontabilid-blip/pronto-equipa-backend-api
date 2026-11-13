import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import {
  OrganizationEntityType,
  OrganizationRecord,
} from '../../domain/services/organization-validation.service';
import {
  OrganizationRecordInput,
  OrganizationRepository,
} from '../../domain/repositories/organization.repository';

export class ManageOrganizationUseCase {
  constructor(
    private readonly repository: OrganizationRepository,
    private readonly audit: AuditRecorderPort,
  ) {}

  async create(companyId: number, actorUserId: number, input: OrganizationRecordInput) {
    const record = await this.repository.create(companyId, actorUserId, input);
    await this.audit.record({
      companyId,
      actorUserId,
      action: `organization.${input.type.toLowerCase()}.created`,
      entityType: input.type.toLowerCase(),
      entityId: record.id,
      after: { id: record.id, code: record.code, name: record.name, version: record.version },
    });
    return record;
  }

  async createCostAllocations(
    companyId: number,
    actorUserId: number,
    inputs: OrganizationRecordInput[],
  ) {
    const records = await this.repository.createCostAllocations(companyId, actorUserId, inputs);
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'organization.cost-allocation.created',
      entityType: 'cost_allocation_batch',
      entityId: records[0]?.id,
      after: { count: records.length, employeeId: inputs[0]?.employeeId },
    });
    return records;
  }

  list(
    companyId: number,
    type: OrganizationEntityType,
    query: {
      page: number;
      limit: number;
      search?: string;
      status?: string;
      parentId?: string;
      relatedId?: string;
    },
  ) {
    return this.repository.list(companyId, type, query);
  }

  async get(
    companyId: number,
    id: string,
    type?: OrganizationEntityType,
  ): Promise<OrganizationRecord> {
    const record = await this.repository.find(companyId, id, type);
    if (!record) {
      const { NotFoundError } = await import('../../../../shared/errors/app.error');
      throw new NotFoundError('Organizational record');
    }
    return record;
  }

  async update(
    companyId: number,
    actorUserId: number,
    id: string,
    expectedVersion: number,
    changes: Partial<OrganizationRecordInput>,
  ) {
    const updated = await this.repository.update(
      companyId,
      actorUserId,
      id,
      expectedVersion,
      changes,
    );
    await this.audit.record({
      companyId,
      actorUserId,
      action: `organization.${updated.type.toLowerCase()}.updated`,
      entityType: updated.type.toLowerCase(),
      entityId: id,
      after: { version: updated.version },
    });
    return updated;
  }

  async status(
    companyId: number,
    actorUserId: number,
    id: string,
    type: OrganizationEntityType,
    expectedVersion: number,
    status: 'ACTIVE' | 'INACTIVE',
  ) {
    const updated = await this.repository.setStatus(
      companyId,
      actorUserId,
      id,
      type,
      expectedVersion,
      status,
    );
    await this.audit.record({
      companyId,
      actorUserId,
      action: `organization.${type.toLowerCase()}.${status.toLowerCase()}`,
      entityType: type.toLowerCase(),
      entityId: id,
      after: { status, version: updated.version },
    });
    return updated;
  }

  async setParent(
    companyId: number,
    actorUserId: number,
    id: string,
    expectedVersion: number,
    parentId: string | null,
  ) {
    const updated = await this.repository.setParent(
      companyId,
      actorUserId,
      id,
      expectedVersion,
      parentId,
    );
    await this.audit.record({
      companyId,
      actorUserId,
      action: 'organization.department.moved',
      entityType: 'department',
      entityId: id,
      after: { parentId, version: updated.version },
    });
    return updated;
  }

  tree(companyId: number) {
    return this.repository.tree(companyId);
  }

  async history(companyId: number, id: string) {
    await this.get(companyId, id);
    return this.repository.history(companyId, id);
  }
}
