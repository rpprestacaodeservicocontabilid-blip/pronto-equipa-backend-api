import { NextFunction, Request, Response, Router } from 'express';
import { AuditRecorderPort } from '../../../audit/application/ports/audit-recorder.port';
import { UnauthorizedError } from '../../../../shared/errors/app.error';
import { EmployeeAdministrationRepository } from '../../infrastructure/persistence/repositories/employee-administration.repository';
import type { ProfileSection } from '../schemas/employee-administration.schema';
import { decision, draftPayload, editDraft, profileSchemas, registrationId, registrationQuery, writeProfile } from '../schemas/employee-administration.schema';
import { employeeIdSchema } from '../schemas/employee.schema';

type Gate = (permission: string) => (req: Request, res: Response, next: NextFunction) => void;
const profileAccess: Record<ProfileSection, [read: string, manage: string]> = {
  identification: ['employees.identifications.read', 'employees.identifications.manage'],
  address: ['employees.personal.read', 'employees.personal.manage'],
  tax: ['employees.tax.read', 'employees.tax.manage'],
  emergency: ['employees.personal.read', 'employees.personal.manage'],
  qualifications: ['employees.personal.read', 'employees.personal.manage'],
};

function context(req: Request) {
  if (!req.tenant || !req.user) throw new UnauthorizedError();
  return { companyId: req.tenant.companyId, userId: req.user.userId };
}

export function createEmployeeAdministrationRoutes(
  repository: EmployeeAdministrationRepository, guard: Gate, audit: AuditRecorderPort,
) {
  const router = Router();
  const draftGrants = [guard('employees.create'), guard('employees.personal.manage')];
  router.use('/registrations', guard('employees.read'), guard('employees.personal.read'));
  router.get('/registrations', async (req, res) => {
    const { companyId } = context(req);
    const query = registrationQuery.parse(req.query);
    res.json({ data: await repository.list(companyId, query.page, query.status) });
  });
  router.get('/registrations/:id', async (req, res) => {
    const { companyId } = context(req);
    res.json({ data: await repository.registration(companyId, registrationId.parse(req.params.id)) });
  });
  router.post('/registrations', ...draftGrants, async (req, res) => {
    const actor = context(req);
    const data = await repository.createDraft(actor, draftPayload.parse(req.body));
    await audit.record({
      companyId: actor.companyId, actorUserId: actor.userId, action: 'employee.registration.draft_created',
      entityType: 'employee_registration', entityId: data.id,
    });
    res.status(201).json({ data });
  });
  router.patch('/registrations/:id', ...draftGrants, async (req, res) => {
    const actor = context(req);
    const { version, content } = editDraft.parse(req.body);
    const data = await repository.editDraft(actor, registrationId.parse(req.params.id), version, content);
    await audit.record({
      companyId: actor.companyId, actorUserId: actor.userId, action: 'employee.registration.draft_updated',
      entityType: 'employee_registration', entityId: data.id, after: { version: data.version },
    });
    res.json({ data });
  });
  for (const action of ['submit', 'approve', 'reject'] as const) {
    const grants = action === 'submit' ? draftGrants : [guard('employees.registration.review')];
    router.post('/registrations/:id/' + action, ...grants, async (req, res) => {
      const actor = context(req);
      const id = registrationId.parse(req.params.id);
      const { version, reason } = decision.parse(req.body);
      const data = await repository.transition(actor, id, version, action, reason);
      await audit.record({
        companyId: actor.companyId, actorUserId: actor.userId, action: 'employee.registration.' + action,
        entityType: 'employee_registration', entityId: id, after: { version: data.version, status: data.status },
      });
      if (action === 'approve') {
        await audit.record({
          companyId: actor.companyId, actorUserId: actor.userId, action: 'employee.created',
          entityType: 'employee', entityId: id, after: { employeeNumber: data.employeeNumber, status: 'ACTIVE' },
        });
      }
      res.json({ data });
    });
  }

  for (const section of Object.keys(profileAccess) as ProfileSection[]) {
    const [read, manage] = profileAccess[section];
    const route = '/:id/profile/' + section;
    router.get(route, guard('employees.read'), guard(read), async (req, res) => {
      const { companyId } = context(req);
      res.json({ data: await repository.profile(companyId, employeeIdSchema.parse(req.params.id), section) });
    });
    router.put(route, guard('employees.read'), guard(read), guard(manage), async (req, res) => {
      const actor = context(req);
      const employeeId = employeeIdSchema.parse(req.params.id);
      const { version, content } = writeProfile.parse(req.body);
      const data = await repository.saveProfile(actor.companyId, employeeId, section, version, profileSchemas[section].parse(content));
      await audit.record({
        companyId: actor.companyId, actorUserId: actor.userId, action: 'employee.profile.updated',
        entityType: 'employee', entityId: employeeId, after: { section, version: data.version },
      });
      res.json({ data });
    });
  }
  return router;
}
