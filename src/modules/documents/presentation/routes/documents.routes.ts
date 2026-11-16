import { NextFunction, Request, Response, Router } from 'express';
import { DOCUMENT_PERMISSIONS as P } from '../../domain/document.types';
import { DocumentsController } from '../controllers/documents.controller';
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
  r.post('/uploads', guard(P.upload), c.uploads.bind(c));
  r.post('/batches', guard(P.bulk), c.batch.bind(c));
  r.get('/batches/:id', guard(P.read), id, c.batchProgress.bind(c));
  r.get('/batches/:id/progress', guard(P.read), id, c.batchProgress.bind(c));
  r.post('/uploads/:id/complete', guard(P.upload), id, c.complete.bind(c));
  r.delete('/uploads/:id', guard(P.upload), id, c.abort.bind(c));
  r.get('/', guard(P.read), guard(P.sensitive), c.list.bind(c));
  r.get('/categories', guard(P.read), c.categories.bind(c));
  r.post('/categories', guard(P.categories), c.categories.bind(c));
  r.get('/storage/usage', guard(P.storage), c.usage.bind(c));
  r.get('/policies', guard(P.policies), c.policy.bind(c));
  r.put('/policies', guard(P.policies), c.policy.bind(c));
  r.get('/audit/access', guard(P.audit), c.audit.bind(c));
  r.get('/:id', guard(P.read), guard(P.sensitive), id, c.get.bind(c));
  r.patch('/:id', guard(P.metadata), id, c.metadata.bind(c));
  r.get('/:id/versions', guard(P.versionRead), guard(P.sensitive), id, c.versions.bind(c));
  r.post('/:id/versions', guard(P.versionCreate), guard(P.sensitive), id, c.createVersion.bind(c));
  r.get('/:id/download', guard(P.download), guard(P.sensitive), id, c.download.bind(c));
  r.get('/:id/preview', guard(P.preview), guard(P.sensitive), id, c.preview.bind(c));
  r.post('/:id/archive', guard(P.archive), id, c.archive.bind(c));
  r.post('/:id/restore', guard(P.restore), id, c.restore.bind(c));
  r.post('/:id/validation/submit', guard(P.validationSubmit), id, c.validation.bind(c));
  r.post(
    '/:id/validation/approve',
    guard(P.validationApprove),
    guard(P.sensitive),
    id,
    c.validation.bind(c),
  );
  r.post('/:id/validation/reject', guard(P.validationReject), id, c.validation.bind(c));
  r.post('/:id/associations', guard(P.associationCreate), id, c.associate.bind(c));
  r.get('/:id/associations', guard(P.read), id, c.associations.bind(c));
  r.post('/:id/legal-holds', guard(P.holdCreate), id, c.hold.bind(c));
  r.post('/legal-holds/:holdId/release', guard(P.holdRelease), c.hold.bind(c));
  r.post('/:id/deletion-requests', guard(P.deleteRequest), id, c.deleteRequest.bind(c));
  r.post('/deletion-requests/:id/approve', guard(P.deleteApprove), id, (req, res) =>
    c.deletionDecision(req, res, true),
  );
  r.post('/deletion-requests/:id/reject', guard(P.deleteApprove), id, (req, res) =>
    c.deletionDecision(req, res, false),
  );
  return r;
};
