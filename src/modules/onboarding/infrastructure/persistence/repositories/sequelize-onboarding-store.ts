import { SequelizeRecordStore } from '../../../../../shared/infrastructure/persistence/sequelize-record-store';
import {
  OnboardingApplication,
  OnboardingResource,
  OnboardingEvent,
} from '../models/onboarding.model';
import {
  OnboardingApplicationView,
  OnboardingResourceView,
  OnboardingEventView,
  OnboardingPersistencePort,
} from '../../../application/ports/onboarding-store.port';
export class SequelizeOnboardingStore implements OnboardingPersistencePort {
  readonly applications = new SequelizeRecordStore<OnboardingApplicationView>(
    OnboardingApplication,
    'onboarding',
  );
  readonly resources = new SequelizeRecordStore<OnboardingResourceView>(
    OnboardingResource,
    'onboarding',
  );
  readonly events = new SequelizeRecordStore<OnboardingEventView>(OnboardingEvent, 'onboarding');
}
