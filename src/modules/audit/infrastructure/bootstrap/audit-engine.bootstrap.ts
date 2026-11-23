import { randomUUID } from 'crypto';
import path from 'path';
import { AuditServices } from '../../application/use-cases/audit-services';
import { AuditCore } from '../../application/use-cases/audit-core';
import { AuditQueryService } from '../../application/use-cases/audit-query.service';
import { AuditInvestigationService } from '../../application/use-cases/audit-investigation.service';
import { AuditEvidenceService } from '../../application/use-cases/audit-evidence.service';
import { AuditExportService } from '../../application/use-cases/audit-export.service';
import { AuditIntegrityService } from '../../application/use-cases/audit-integrity.service';
import { AuditMonitorService } from '../../application/use-cases/audit-monitor.service';
import { AuditRetentionService } from '../../application/use-cases/audit-retention.service';
import { SequelizeAuditEngineRepository } from '../persistence/repositories/sequelize-audit-engine.repository';
import { NodeAuditCrypto } from '../integrity/node-audit-crypto';
import { FileAuditEvidenceStorage } from '../storage/file-audit-evidence.storage';
import { DatabaseAuditEventSource } from '../adapters/database-audit-event-source';
import { installAuditTransactionContext } from '../adapters/sequelize-audit-context';
import {
  AuditAuthorize,
  createAuditEngineRoutes,
} from '../../presentation/routes/audit-engine.routes';
import { AuditRuntime } from '../jobs/audit-runtime';
import { AuditNotificationPort } from '../../application/ports/audit-engine.ports';
import { AuditAppendPort } from '../../application/ports/audit-engine.ports';
import { TransactionalAuditPort } from '../../application/ports/audit-engine.ports';
import { auditFailure } from '../../domain/audit-contracts';
import { AuditEventPublisherPort } from '../../application/ports/audit-event-publisher.port';
import { RedisAuditEventPublisher } from '../adapters/redis-audit-event-publisher';
import { AuditEventRecorderPort } from '../../application/ports/audit-event-recorder.port';

export function createAuditEventRecorder(sourceId = 'application'): AuditEventRecorderPort {
  return {
    record(input) {
      return auditEngine().core.append({ ...input, sourceId });
    },
  };
}

export function createAuditAppendPort(): AuditAppendPort {
  return auditEngine().core;
}

let instance: AuditServices | undefined;
export function auditEngine(): AuditServices {
  if (instance) return instance;
  const publicKeys: unknown = JSON.parse(process.env.AUDIT_TRUSTED_PUBLIC_KEYS || '{}');
  if (
    !publicKeys ||
    typeof publicKeys !== 'object' ||
    Array.isArray(publicKeys) ||
    Object.values(publicKeys).some((v) => typeof v !== 'string')
  )
    throw new Error('Invalid AUDIT_TRUSTED_PUBLIC_KEYS.');
  const core = new AuditCore(
    new SequelizeAuditEngineRepository(),
    new NodeAuditCrypto(
      process.env.AUDIT_SIGNING_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      publicKeys as Record<string, string>,
      process.env.AUDIT_SIGNING_KEY_ID || 'audit-key-v1',
    ),
    { now: () => new Date(), id: randomUUID },
  );
  const storage = new FileAuditEvidenceStorage(
    process.env.AUDIT_EVIDENCE_ROOT || path.resolve('storage/private/audit'),
    process.env.AUDIT_ANCHOR_ROOT,
  );
  const evidence = new AuditEvidenceService(core, storage),
    integrity = new AuditIntegrityService(core, storage);
  instance = {
    core,
    query: new AuditQueryService(core),
    investigations: new AuditInvestigationService(core),
    evidence,
    integrity,
    exports: new AuditExportService(core, evidence),
    monitor: new AuditMonitorService(core, new DatabaseAuditEventSource(), storage),
    retention: new AuditRetentionService(core, evidence, integrity),
  };
  installAuditTransactionContext();
  return instance;
}
export function createAuditModule(options: {
  authorize: AuditAuthorize;
  notifications?: AuditNotificationPort;
  publisher?: AuditEventPublisherPort;
}) {
  const services = auditEngine();
  const transactionalAudit: TransactionalAuditPort = {
    append(input, context) {
      if (!context) throw auditFailure('Critical audit requires the business transaction context.');
      return services.core.append(input, context);
    },
  };
  return {
    services,
    transactionalAudit,
    routes: createAuditEngineRoutes(services, options.authorize),
    platformRoutes: createAuditEngineRoutes(services, options.authorize, true),
    personalRoutes: createAuditEngineRoutes(services, options.authorize, true, true),
    runtime: new AuditRuntime(
      services,
      options.authorize,
      options.notifications,
      options.publisher ||
        (process.env.NODE_ENV === 'production' || process.env.AUDIT_EVENTS_ENABLED === 'true'
          ? new RedisAuditEventPublisher()
          : undefined),
    ),
  };
}
