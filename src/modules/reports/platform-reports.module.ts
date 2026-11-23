import { AuditRecorderPort } from '../audit/application/ports/audit-recorder.port';
import { SequelizePlatformRoleChecker } from '../authorization/infrastructure/persistence/sequelize-platform-role-checker';
import { payrollPdf, payrollXlsx } from '../payroll/infrastructure/payroll-export';
import { UserModel } from '../user/infrastructure/persistence/models/user.model';
import { logger } from '../../config/logger';
import { PlatformReportsService } from './application/use-cases/platform-reports.service';
import { PlatformReportRecord } from './infrastructure/persistence/models/platform-report-record.model';
import { PlatformReportObservations } from './infrastructure/platform-report-observations';
import { createPlatformReportsRoutes } from './presentation/routes/platform-reports.routes';

export function createPlatformReportsModule(
  audit: AuditRecorderPort,
  onboardingDaily: (from: string, to: string) => Promise<{ label: string; count: number }[]>,
) {
  const roles = new SequelizePlatformRoleChecker();
  const source = new PlatformReportObservations(onboardingDaily);
  const service = new PlatformReportsService(PlatformReportRecord, source, audit, { pdf: payrollPdf, xlsx: payrollXlsx }, async id => {
    const user = await UserModel.findByPk(id, { attributes: ['status'] });
    return user?.status === 'ACTIVE' && await roles.hasAnyRole(id, ['SUPER_ADMIN']);
  });
  let timer: ReturnType<typeof setInterval> | undefined;
  let active: Promise<void> | undefined;
  const tick = () => {
    if (active) return;
    active = service.tick()
      .catch(error => { logger.error('[platform reports] schedule processing failed', { message: String(error) }); })
      .finally(() => { active = undefined; });
  };
  return {
    routes: createPlatformReportsRoutes(service, source),
    start() {
      if (timer) return;
      timer = setInterval(tick, 60000);
      timer.unref();
      tick();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await active;
    },
  };
}

