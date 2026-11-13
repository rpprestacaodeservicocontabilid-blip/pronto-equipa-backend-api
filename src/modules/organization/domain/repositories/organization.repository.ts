import {
  OrganizationEntityType,
  OrganizationRecord,
} from '../services/organization-validation.service';

export interface OrganizationRecordInput {
  type: OrganizationEntityType;
  code: string;
  name: string;
  parentId?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  employeeId?: string | null;
  relatedId?: string | null;
  percentage?: number | string | null;
  data?: Record<string, unknown>;
}

export interface OrganizationRepository {
  create(
    companyId: number,
    actorUserId: number,
    input: OrganizationRecordInput,
  ): Promise<OrganizationRecord>;
  createCostAllocations(
    companyId: number,
    actorUserId: number,
    input: Array<OrganizationRecordInput>,
  ): Promise<OrganizationRecord[]>;
  find(
    companyId: number,
    id: string,
    type?: OrganizationEntityType,
  ): Promise<OrganizationRecord | null>;
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
  ): Promise<{
    data: OrganizationRecord[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>;
  update(
    companyId: number,
    actorUserId: number,
    id: string,
    expectedVersion: number,
    changes: Partial<OrganizationRecordInput>,
  ): Promise<OrganizationRecord>;
  setStatus(
    companyId: number,
    actorUserId: number,
    id: string,
    type: OrganizationEntityType,
    expectedVersion: number,
    status: 'ACTIVE' | 'INACTIVE',
  ): Promise<OrganizationRecord>;
  setParent(
    companyId: number,
    actorUserId: number,
    id: string,
    expectedVersion: number,
    parentId: string | null,
  ): Promise<OrganizationRecord>;
  tree(companyId: number): Promise<OrganizationRecord[]>;
  history(companyId: number, id: string): Promise<Array<Record<string, unknown>>>;
}
