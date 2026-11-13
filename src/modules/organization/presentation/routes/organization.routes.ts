import { NextFunction, Request, Response, Router } from 'express';
import { OrganizationController } from '../controllers/organization.controller';
import {
  createOrganizationQuerySchema,
  organizationIdSchema,
  organizationStatusSchema,
  setDepartmentParentSchema,
} from '../schemas/organization.schema';

type Middleware = (req: Request, res: Response, next: NextFunction) => void;
type Schema = { parse(value: unknown): unknown };

const validate =
  (target: 'body' | 'query', schema: Schema): Middleware =>
  (req, _res, next) => {
    try {
      if (target === 'body') req.body = schema.parse(req.body);
      else req.query = schema.parse(req.query) as Request['query'];
      next();
    } catch (error) {
      next(error);
    }
  };

const validateId: Middleware = (req, _res, next) => {
  try {
    req.params.id = organizationIdSchema.parse(req.params.id);
    next();
  } catch (error) {
    next(error);
  }
};

const resources = [
  [
    'departments',
    'organization:read',
    'organization:departments:create',
    'organization:departments:update',
    'organization:departments:deactivate',
  ],
  [
    'job-functions',
    'organization:read',
    'organization:functions:manage',
    'organization:functions:manage',
    'organization:functions:manage',
  ],
  [
    'job-positions',
    'organization:read',
    'organization:positions:manage',
    'organization:positions:manage',
    'organization:positions:manage',
  ],
  [
    'professional-categories',
    'organization:read',
    'organization:categories:manage',
    'organization:categories:manage',
    'organization:categories:manage',
  ],
  [
    'cost-centers',
    'organization:read',
    'organization:cost-centers:manage',
    'organization:cost-centers:manage',
    'organization:cost-centers:manage',
  ],
  [
    'cost-allocations',
    'organization:read',
    'organization:cost-allocations:manage',
    'organization:cost-allocations:manage',
    'organization:cost-allocations:manage',
  ],
  [
    'establishments',
    'organization:read',
    'organization:establishments:manage',
    'organization:establishments:manage',
    'organization:establishments:manage',
  ],
  [
    'calendars',
    'organization:read',
    'organization:calendars:manage',
    'organization:calendars:manage',
    'organization:calendars:manage',
  ],
  [
    'schedules',
    'organization:read',
    'organization:schedules:manage',
    'organization:schedules:manage',
    'organization:schedules:manage',
  ],
] as const;

export const createOrganizationRoutes = (
  controller: OrganizationController,
  requirePermission: (permission: string) => Middleware,
): Router => {
  const router = Router();

  router.get('/departments/tree', requirePermission('organization:read'), (req, res) =>
    controller.departmentTree(req, res),
  );
  router.patch(
    '/departments/:id/parent',
    requirePermission('organization:hierarchy:manage'),
    validateId,
    validate('body', setDepartmentParentSchema),
    (req, res) => controller.setParent(req, res),
  );
  router.post(
    '/departments/:id/employees',
    requirePermission('organization:departments:update'),
    validateId,
    (req, res) => controller.assignDepartmentEmployee(req, res),
  );
  router.get(
    '/departments/:id/employees',
    requirePermission('organization:read'),
    validateId,
    (req, res) => controller.listChildren(req, res, 'DEPARTMENT_ASSIGNMENT'),
  );
  router.post(
    '/calendars/:id/exceptions',
    requirePermission('organization:calendars:manage'),
    validateId,
    (req, res) => controller.createChild(req, res, 'CALENDAR_EXCEPTION'),
  );
  router.get(
    '/calendars/:id/exceptions',
    requirePermission('organization:read'),
    validateId,
    (req, res) => controller.listChildren(req, res, 'CALENDAR_EXCEPTION'),
  );
  router.post(
    '/schedules/:id/shifts',
    requirePermission('organization:schedules:manage'),
    validateId,
    (req, res) => controller.createChild(req, res, 'WORK_SHIFT'),
  );
  router.get(
    '/schedules/:id/shifts',
    requirePermission('organization:read'),
    validateId,
    (req, res) => controller.listChildren(req, res, 'WORK_SHIFT'),
  );
  router.get(
    '/schedule-assignments',
    requirePermission('organization:read'),
    validate('query', createOrganizationQuerySchema),
    (req, res) => controller.assignments(req, res),
  );
  router.post(
    '/schedule-assignments',
    requirePermission('organization:schedules:manage'),
    (req, res) => controller.assignments(req, res),
  );

  for (const [
    resource,
    readPermission,
    createPermission,
    updatePermission,
    deactivatePermission,
  ] of resources) {
    router.get(
      `/${resource}`,
      requirePermission(readPermission),
      validate('query', createOrganizationQuerySchema),
      (req, res) => {
        req.params.resource = resource;
        return controller.list(req, res);
      },
    );
    router.post(`/${resource}`, requirePermission(createPermission), (req, res) => {
      req.params.resource = resource;
      return controller.create(req, res);
    });
    router.get(
      `/${resource}/:id/history`,
      requirePermission('organization:history:read'),
      validateId,
      (req, res) => controller.history(req, res),
    );
    router.get(`/${resource}/:id`, requirePermission(readPermission), validateId, (req, res) => {
      req.params.resource = resource;
      return controller.get(req, res);
    });
    router.patch(`/${resource}/:id`, requirePermission(updatePermission), validateId, (req, res) =>
      controller.update(req, res),
    );
    router.post(
      `/${resource}/:id/deactivate`,
      requirePermission(deactivatePermission),
      validateId,
      validate('body', organizationStatusSchema),
      (req, res) => {
        req.params.resource = resource;
        return controller.setStatus(req, res, 'INACTIVE');
      },
    );
    router.post(
      `/${resource}/:id/activate`,
      requirePermission(updatePermission),
      validateId,
      validate('body', organizationStatusSchema),
      (req, res) => {
        req.params.resource = resource;
        return controller.setStatus(req, res, 'ACTIVE');
      },
    );
  }

  return router;
};
