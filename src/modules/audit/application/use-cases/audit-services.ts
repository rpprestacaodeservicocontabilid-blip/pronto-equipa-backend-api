import { AuditCore } from './audit-core';
import { AuditQueryService } from './audit-query.service';
import { AuditInvestigationService } from './audit-investigation.service';
import { AuditEvidenceService } from './audit-evidence.service';
import { AuditExportService } from './audit-export.service';
import { AuditIntegrityService } from './audit-integrity.service';
import { AuditMonitorService } from './audit-monitor.service';
import { AuditRetentionService } from './audit-retention.service';
export interface AuditServices {
  core: AuditCore;
  query: AuditQueryService;
  investigations: AuditInvestigationService;
  evidence: AuditEvidenceService;
  exports: AuditExportService;
  integrity: AuditIntegrityService;
  monitor: AuditMonitorService;
  retention: AuditRetentionService;
}
