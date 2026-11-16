import { SequelizeDocumentPersistence } from './infrastructure/persistence/repositories/sequelize-document-persistence';
import { RequestHandler } from 'express';
import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { DocumentsApplicationService } from './application/use-cases/documents-application.service';
import { ClamAvDocumentScanner } from './infrastructure/scanners/clamav-document-scanner.adapter';
import { S3DocumentStorage } from './infrastructure/storage/s3-document-storage.adapter';
import { DocumentsController } from './presentation/controllers/documents.controller';
import { createDocumentsRoutes } from './presentation/routes/documents.routes';
import { DocumentsRuntime } from './infrastructure/jobs/documents-runtime';
export function createDocumentsModule(options: {
  requirePermission: (permission: string) => RequestHandler;
  audit: AuditRecorderPort;
}) {
  const service = new DocumentsApplicationService(
    new S3DocumentStorage(),
    new ClamAvDocumentScanner(),
    options.audit,
    new SequelizeDocumentPersistence(),
  );
  const controller = new DocumentsController(service);
  const runtime = new DocumentsRuntime(service);
  return { routes: createDocumentsRoutes(controller, options.requirePermission), runtime, service };
}
