import { NextFunction, Request, Response, Router, RequestHandler } from 'express';
import { DOCUMENT_PERMISSIONS as P } from '../../domain/document.types';
import { DocumentsController } from '../controllers/documents.controller';
import { z } from 'zod';
import { uuidSchema } from '../schemas/documents.schema';
type Guard = (permission: string) => (req: Request, res: Response, next: NextFunction) => void;
const id = (req: Request, res: Response, next: NextFunction) => {
  if (!uuidSchema.safeParse(req.params.id).success) {
    res.status(400).json({ success: false, message: 'Identificador UUID inválido.' });
    return;
  }
  next();
};
export const createDocumentsRoutes = (c: DocumentsController, guard: Guard) => {
  const r = Router();
  const endpoint = (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
    (req, res, next) => { void Promise.resolve().then(() => handler(req, res)).catch(next); };
  r.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const queues = [['uploads', P.upload], ['batches', P.bulk], ['deletions', P.deleteApprove],
    ['holds', P.holdCreate], ['reviews', P.read]] as const;
  for (const [kind, permission] of queues) {
    r.get('/operations/' + kind, guard(permission), guard(P.sensitive), endpoint(async (req, res) => {
      const query = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(25), documentId: uuidSchema.optional() }).parse(req.query);
      res.json({ success: true, data: await c.operations(req.tenant!.companyId, kind, query.page, query.limit, query.documentId) });
    }));
  }

  r.post('/uploads', guard(P.upload), endpoint(c.uploads.bind(c)));
  r.post('/batches', guard(P.bulk), endpoint(c.batch.bind(c)));
  r.get('/batches/:id', guard(P.read), id, endpoint(c.batchProgress.bind(c)));
  r.get('/batches/:id/progress', guard(P.read), id, endpoint(c.batchProgress.bind(c)));
  r.post('/uploads/:id/complete', guard(P.upload), id, endpoint(c.complete.bind(c)));
  r.delete('/uploads/:id', guard(P.upload), id, endpoint(c.abort.bind(c)));
  r.get('/', guard(P.read), guard(P.sensitive), endpoint(c.list.bind(c)));
  r.get('/categories', guard(P.read), endpoint(c.categories.bind(c)));
  r.post('/categories', guard(P.categories), endpoint(c.categories.bind(c)));
  r.get('/storage/usage', guard(P.storage), endpoint(c.usage.bind(c)));
  r.get('/policies', guard(P.policies), endpoint(c.policy.bind(c)));
  r.put('/policies', guard(P.policies), endpoint(c.policy.bind(c)));
  r.get('/audit/access', guard(P.audit), endpoint(c.audit.bind(c)));
  r.get('/:id', guard(P.read), guard(P.sensitive), id, endpoint(c.get.bind(c)));
  r.patch('/:id', guard(P.metadata), guard(P.sensitive), id, endpoint(c.metadata.bind(c)));
  r.get('/:id/versions', guard(P.versionRead), guard(P.sensitive), id, endpoint(c.versions.bind(c)));
  r.post('/:id/versions', guard(P.versionCreate), guard(P.sensitive), id, endpoint(c.createVersion.bind(c)));
  r.get('/:id/download', guard(P.download), guard(P.sensitive), id, endpoint(c.download.bind(c)));
  r.get('/:id/preview', guard(P.preview), guard(P.sensitive), id, endpoint(c.preview.bind(c)));
  r.post('/:id/archive', guard(P.archive), guard(P.sensitive), id, endpoint(c.archive.bind(c)));
  r.post('/:id/restore', guard(P.restore), guard(P.sensitive), id, endpoint(c.restore.bind(c)));
  r.post('/:id/validation/submit', guard(P.validationSubmit), guard(P.sensitive), id, endpoint(c.validation.bind(c)));
  r.post(
    '/:id/validation/approve',
    guard(P.validationApprove),
    guard(P.sensitive),
    id,
    endpoint(c.validation.bind(c)),
  );
  r.post('/:id/validation/reject', guard(P.validationReject), guard(P.sensitive), id, endpoint(c.validation.bind(c)));
  r.post('/:id/associations', guard(P.associationCreate), guard(P.sensitive), id, endpoint(c.associate.bind(c)));
  r.get('/:id/associations', guard(P.read), guard(P.sensitive), id, endpoint(c.associations.bind(c)));
  r.post('/:id/legal-holds', guard(P.holdCreate), guard(P.sensitive), id, endpoint(c.hold.bind(c)));
  r.post('/legal-holds/:holdId/release', guard(P.holdRelease), guard(P.sensitive), endpoint(c.hold.bind(c)));
  r.post('/:id/deletion-requests', guard(P.deleteRequest), guard(P.sensitive), id, endpoint(c.deleteRequest.bind(c)));
  r.post('/deletion-requests/:id/approve', guard(P.deleteApprove), guard(P.sensitive), id, endpoint((req, res) => c.deletionDecision(req, res, true)),
  );
  r.post('/deletion-requests/:id/reject', guard(P.deleteApprove), guard(P.sensitive), id, endpoint((req, res) => c.deletionDecision(req, res, false)),
  );
  return r;
};
