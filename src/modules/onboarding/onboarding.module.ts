import { SequelizeOnboardingStore } from './infrastructure/persistence/repositories/sequelize-onboarding-store';
import { S3DocumentStorage } from '../documents/infrastructure/storage/s3-document-storage.adapter';
import { ClamAvDocumentScanner } from '../documents/infrastructure/scanners/clamav-document-scanner.adapter';
import { OnboardingPorts } from './domain/onboarding';
import {
  OnboardingResourcePorts,
} from './application/use-cases/onboarding-resources.service';
import { OnboardingAdminService } from './application/use-cases/onboarding-admin.service';
import { OnboardingRuntime } from './infrastructure/jobs/onboarding-runtime';
import { createOnboardingRoutes } from './presentation/routes/onboarding.routes';
export function createOnboardingModule(
  ports: OnboardingPorts,
  resources: Omit<OnboardingResourcePorts, 'storage' | 'scanner'>,
) {
  const service = new OnboardingAdminService(
    ports,
    { ...resources, storage: new S3DocumentStorage(), scanner: new ClamAvDocumentScanner() },
    new SequelizeOnboardingStore(),
  );
  return { ...createOnboardingRoutes(service), service, runtime: new OnboardingRuntime(service) };
}

