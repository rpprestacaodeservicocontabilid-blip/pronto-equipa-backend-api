import { Request, Response } from 'express';
import { OrganizationEntityType } from '../../domain/services/organization-validation.service';
import { ManageOrganizationUseCase } from '../../application/use-cases/manage-organization.use-case';
import {
  costAllocationBatchSchema,
  createOrganizationQuerySchema,
  organizationUpdateSchema,
  parseOrganizationRecord,
  ParsedOrganizationInput,
} from '../schemas/organization.schema';

const resourceTypes: Record<string, OrganizationEntityType> = {
  departments: 'DEPARTMENT',
  'job-functions': 'JOB_FUNCTION',
  'job-positions': 'JOB_POSITION',
  'professional-categories': 'PROFESSIONAL_CATEGORY',
  'cost-centers': 'COST_CENTER',
  'cost-allocations': 'COST_ALLOCATION',
  establishments: 'ESTABLISHMENT',
  calendars: 'WORK_CALENDAR',
  schedules: 'WORK_SCHEDULE',
};

export class OrganizationController {
  constructor(private readonly organization: ManageOrganizationUseCase) {}

  async list(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const type = this.type(req.params.resource);
    const result = await this.organization.list(companyId, type, req.query as never);
    res.status(200).json({ success: true, ...result });
  }

  async create(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const type = this.type(req.params.resource);
    if (type === 'COST_ALLOCATION') {
      const body = costAllocationBatchSchema.parse(req.body);
      const allocations = body.allocations.map((allocation, index) => ({
        type,
        code: `${body.employeeId.slice(0, 8)}-${index + 1}-${body.effectiveFrom}`,
        name: `Allocation ${index + 1}`,
        employeeId: body.employeeId,
        relatedId: allocation.costCenterId,
        percentage: allocation.percentage,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo ?? null,
        data: {},
      }));
      const data = await this.organization.createCostAllocations(
        context.companyId,
        context.actorUserId,
        allocations,
      );
      res.status(201).json({ success: true, data });
      return;
    }
    const body = parseOrganizationRecord(type, req.body) as ParsedOrganizationInput & {
      effectiveFrom?: string | null;
      effectiveTo?: string | null;
      employeeId?: string | null;
      relatedId?: string | null;
      parentId?: string | null;
      data?: Record<string, unknown>;
    };
    const data = await this.organization.create(context.companyId, context.actorUserId, {
      ...body,
      type,
    } as never);
    res.status(201).json({ success: true, data });
  }

  async get(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.organization.get(
      companyId,
      req.params.id,
      this.type(req.params.resource),
    );
    res.status(200).json({ success: true, data });
  }

  async update(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = organizationUpdateSchema.parse(req.body);
    const { expectedVersion, ...changes } = body;
    const data = await this.organization.update(
      context.companyId,
      context.actorUserId,
      req.params.id,
      expectedVersion,
      changes,
    );
    res.status(200).json({ success: true, data });
  }

  async setStatus(req: Request, res: Response, status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as { expectedVersion: number };
    const data = await this.organization.status(
      context.companyId,
      context.actorUserId,
      req.params.id,
      this.type(req.params.resource),
      body.expectedVersion,
      status,
    );
    res.status(200).json({ success: true, data });
  }

  async setParent(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const body = req.body as { expectedVersion: number; parentId: string | null };
    const data = await this.organization.setParent(
      context.companyId,
      context.actorUserId,
      req.params.id,
      body.expectedVersion,
      body.parentId,
    );
    res.status(200).json({ success: true, data });
  }

  async departmentTree(_req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const records = await this.organization.tree(companyId);
    const nodes = new Map(
      records.map((record) => [record.id, { ...record, children: [] as unknown[] }]),
    );
    const roots: unknown[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    res.status(200).json({ success: true, data: roots });
  }

  async createChild(
    req: Request,
    res: Response,
    childType: 'CALENDAR_EXCEPTION' | 'WORK_SHIFT',
  ): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    const parentType = childType === 'CALENDAR_EXCEPTION' ? 'WORK_CALENDAR' : 'WORK_SCHEDULE';
    await this.organization.get(context.companyId, req.params.id, parentType);
    const body = parseOrganizationRecord(childType, { ...req.body, parentId: req.params.id });
    const data = await this.organization.create(context.companyId, context.actorUserId, {
      ...body,
      type: childType,
    } as never);
    res.status(201).json({ success: true, data });
  }

  async listChildren(
    req: Request,
    res: Response,
    childType: 'CALENDAR_EXCEPTION' | 'WORK_SHIFT' | 'DEPARTMENT_ASSIGNMENT',
  ): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const parentType =
      childType === 'CALENDAR_EXCEPTION'
        ? 'WORK_CALENDAR'
        : childType === 'WORK_SHIFT'
          ? 'WORK_SCHEDULE'
          : 'DEPARTMENT';
    await this.organization.get(companyId, req.params.id, parentType);
    const query = createOrganizationQuerySchema.parse(req.query);
    const result = await this.organization.list(companyId, childType, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      ...(childType === 'DEPARTMENT_ASSIGNMENT'
        ? { relatedId: req.params.id }
        : { parentId: req.params.id }),
    });
    res.status(200).json({ success: true, ...result });
  }

  async assignments(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    if (req.method === 'GET') {
      const query = createOrganizationQuerySchema.parse(req.query);
      const result = await this.organization.list(context.companyId, 'SCHEDULE_ASSIGNMENT', query);
      res.status(200).json({ success: true, ...result });
      return;
    }
    const body = parseOrganizationRecord('SCHEDULE_ASSIGNMENT', req.body);
    const data = await this.organization.create(context.companyId, context.actorUserId, {
      ...body,
      type: 'SCHEDULE_ASSIGNMENT',
    } as never);
    res.status(201).json({ success: true, data });
  }

  async assignDepartmentEmployee(req: Request, res: Response): Promise<void> {
    const context = this.context(req, res);
    if (!context) return;
    await this.organization.get(context.companyId, req.params.id, 'DEPARTMENT');
    const body = parseOrganizationRecord('DEPARTMENT_ASSIGNMENT', {
      ...req.body,
      relatedId: req.params.id,
    });
    const data = await this.organization.create(context.companyId, context.actorUserId, {
      ...body,
      type: 'DEPARTMENT_ASSIGNMENT',
    });
    res.status(201).json({ success: true, data });
  }

  async history(req: Request, res: Response): Promise<void> {
    const companyId = this.companyId(res);
    if (companyId === null) return;
    const data = await this.organization.history(companyId, req.params.id);
    res.status(200).json({ success: true, data });
  }

  private type(resource: string): OrganizationEntityType {
    const type = resourceTypes[resource];
    if (!type) throw new Error(`Unknown organization resource: ${resource}`);
    return type;
  }

  private context(req: Request, res: Response): { companyId: number; actorUserId: number } | null {
    const companyId = this.companyId(res);
    const actorUserId = req.user?.userId;
    if (companyId === null) return null;
    if (!actorUserId) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return null;
    }
    return { companyId, actorUserId };
  }

  private companyId(res: Response): number | null {
    const companyId = res.req.tenant?.companyId;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company context is required.' });
      return null;
    }
    return companyId;
  }
}
