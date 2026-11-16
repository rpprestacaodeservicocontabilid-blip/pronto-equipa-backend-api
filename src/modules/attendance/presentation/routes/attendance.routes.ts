import { NextFunction, Request, Response, Router } from 'express';
import { AttendanceController } from '../controllers/attendance.controller';

import {
  attendanceIdSchema,
  attendanceReportSchema,
  calculateDaySchema,
  correctionSchema,
  createJustificationSchema,
  createPeriodSchema,
  createPunchSchema,
  createCorrectionSchema,
  decisionSchema,
  importPunchesSchema,
  listAttendanceSchema,
  policySchema,
  rectificationSchema,
} from '../schemas/attendance.schema';

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
    req.params.id = attendanceIdSchema.parse(req.params.id);
    next();
  } catch (error) {
    next(error);
  }
};

export const createAttendanceRoutes = (
  controller: AttendanceController,
  requirePermission: (permission: string) => Middleware,
): Router => {
  const router = Router();

  router.post(
    '/punches',
    requirePermission('attendance.punches.create'),
    validate('body', createPunchSchema),
    (req, res) => controller.recordPunch(req, res),
  );
  router.post(
    '/records',
    requirePermission('attendance.punches.create'),
    validate('body', createPunchSchema),
    (req, res) => controller.recordPunch(req, res),
  );
  router.post(
    '/punches/import',
    requirePermission('attendance.imports.create'),
    validate('body', importPunchesSchema),
    (req, res) => controller.importPunches(req, res),
  );
  router.get(
    '/punches',
    requirePermission('attendance.punches.read'),
    validate('query', listAttendanceSchema),
    (req, res) => controller.listPunches(req, res),
  );
  router.get(
    '/records',
    requirePermission('attendance.punches.read'),
    validate('query', listAttendanceSchema),
    (req, res) => controller.listPunches(req, res),
  );
  router.get('/records/:id', requirePermission('attendance.punches.read'), validateId, (req, res) =>
    controller.getPunch(req, res),
  );
  router.get(
    '/employees/:employeeId/records',
    requirePermission('attendance.punches.read'),
    validate('query', listAttendanceSchema),
    (req, res) => controller.listEmployeePunches(req, res),
  );
  router.post(
    '/days/recalculate',
    requirePermission('attendance.days.calculate'),
    validate('body', calculateDaySchema),
    (req, res) => controller.calculateDay(req, res),
  );
  router.get(
    '/days',
    requirePermission('attendance.days.read'),
    validate('query', listAttendanceSchema),
    (req, res) => controller.listDays(req, res),
  );
  router.get('/days/:id', requirePermission('attendance.days.read'), validateId, (req, res) =>
    controller.getEntity(req, res, 'DAY'),
  );

  router.get(
    '/occurrences',
    requirePermission('attendance.occurrences.read'),
    validate('query', listAttendanceSchema),
    (req, res) => controller.listEntities(req, res, 'OCCURRENCE'),
  );
  router.get(
    '/occurrences/:id',
    requirePermission('attendance.occurrences.read'),
    validateId,
    (req, res) => controller.getEntity(req, res, 'OCCURRENCE'),
  );
  router.get(
    '/justifications',
    requirePermission('attendance.justifications.read'),
    validate('query', listAttendanceSchema),
    (req, res) => controller.listEntities(req, res, 'JUSTIFICATION'),
  );
  router.get(
    '/justifications/:id',
    requirePermission('attendance.justifications.read'),
    validateId,
    (req, res) => controller.getEntity(req, res, 'JUSTIFICATION'),
  );
  router.post(
    '/occurrences/:id/justifications',
    requirePermission('attendance.justifications.create'),
    validateId,
    validate('body', createJustificationSchema),
    (req, res) => controller.createJustification(req, res),
  );
  router.post(
    '/justifications',
    requirePermission('attendance.justifications.create'),
    validate('body', createJustificationSchema.extend({ occurrenceId: attendanceIdSchema })),
    (req, res) => controller.createJustification(req, res),
  );
  router.post(
    '/justifications/:id/decision',
    requirePermission('attendance.justifications.decide'),
    validateId,
    validate('body', decisionSchema),
    (req, res) => controller.decideJustification(req, res),
  );
  router.post(
    '/justifications/:id/approve',
    requirePermission('attendance.justifications.decide'),
    validateId,
    (req, res) => controller.decideJustification(req, res, 'APPROVED'),
  );
  router.post(
    '/justifications/:id/reject',
    requirePermission('attendance.justifications.decide'),
    validateId,
    (req, res) => controller.decideJustification(req, res, 'REJECTED'),
  );
  router.post(
    '/justifications/:id/return',
    requirePermission('attendance.justifications.decide'),
    validateId,
    (req, res) => controller.decideJustification(req, res, 'RETURNED'),
  );

  router.get(
    '/corrections',
    requirePermission('attendance.corrections.read'),
    validate('query', listAttendanceSchema),
    (req, res) => controller.listCorrections(req, res),
  );
  router.get(
    '/corrections/:id',
    requirePermission('attendance.corrections.read'),
    validateId,
    (req, res) => controller.getCorrection(req, res),
  );
  router.post(
    '/punches/:id/corrections',
    requirePermission('attendance.corrections.create'),
    validateId,
    validate('body', correctionSchema),
    (req, res) => controller.requestCorrection(req, res),
  );
  router.post(
    '/records/:id/corrections',
    requirePermission('attendance.corrections.create'),
    validateId,
    validate('body', correctionSchema),
    (req, res) => controller.requestCorrection(req, res),
  );
  router.post(
    '/corrections',
    requirePermission('attendance.corrections.create'),
    validate('body', createCorrectionSchema),
    (req, res) => controller.requestCorrection(req, res),
  );
  router.post(
    '/corrections/:id/decision',
    requirePermission('attendance.corrections.decide'),
    validateId,
    validate('body', decisionSchema),
    (req, res) => controller.decideCorrection(req, res),
  );
  router.post(
    '/corrections/:id/approve',
    requirePermission('attendance.corrections.decide'),
    validateId,
    (req, res) => controller.decideCorrection(req, res, 'APPROVED'),
  );
  router.post(
    '/corrections/:id/reject',
    requirePermission('attendance.corrections.decide'),
    validateId,
    (req, res) => controller.decideCorrection(req, res, 'REJECTED'),
  );

  router.get(
    '/periods',
    requirePermission('attendance.periods.read'),
    validate('query', listAttendanceSchema),
    (req, res) => controller.listEntities(req, res, 'PERIOD'),
  );
  router.get('/periods/:id', requirePermission('attendance.periods.read'), validateId, (req, res) =>
    controller.getPeriod(req, res),
  );
  router.get(
    '/periods/:id/snapshots',
    requirePermission('attendance.periods.read'),
    validateId,
    (req, res) => controller.listSnapshots(req, res),
  );
  router.post(
    '/periods',
    requirePermission('attendance.periods.manage'),
    validate('body', createPeriodSchema),
    (req, res) => controller.createPeriod(req, res),
  );
  router.post(
    '/periods/:id/validate',
    requirePermission('attendance.periods.manage'),
    validateId,
    (req, res) => controller.validatePeriod(req, res),
  );
  router.post(
    '/periods/:id/close',
    requirePermission('attendance.periods.close'),
    validateId,
    (req, res) => controller.closePeriod(req, res),
  );
  router.post(
    '/periods/:id/rectifications',
    requirePermission('attendance.corrections.create'),
    validateId,
    validate('body', rectificationSchema),
    (req, res) => controller.requestRectification(req, res),
  );
  router.get(
    '/reports/summary',
    requirePermission('attendance.reports.read'),
    validate('query', attendanceReportSchema),
    (req, res) => controller.attendanceSummary(req, res),
  );
  router.post(
    '/policy',
    requirePermission('attendance.policy.manage'),
    validate('body', policySchema),
    (req, res) => controller.setPolicy(req, res),
  );

  return router;
};
