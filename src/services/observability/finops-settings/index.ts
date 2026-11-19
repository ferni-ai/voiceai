/**
 * The FinOps settings (MRR, cash reserve, CAC, churn, customer lifetime, alert thresholds),
 * saved in Firestore so they survive a restart and every API instance reads the same ones.
 * They used to live in module memory: lost on restart and different on each Cloud Run
 * instance, so a Save might not show on the next request. Callers import this file, which
 * wires the service to the Firestore store; the rules are in domain/, the store in ports/.
 *
 * @module services/observability/finops-settings
 */
import { firestoreFinOpsSettingsStore } from './adapters/firestore-finops-settings-store.js';
import { createFinOpsSettingsService } from './use-cases/finops-settings-service.js';

export {
  ThresholdsPatchSchema,
  type FinOpsSettingsPatch,
  type FinOpsThresholds,
  type SavedFinOpsSettings,
} from './domain/finops-settings.js';
export { FinOpsSettingsUnavailableError } from './use-cases/finops-settings-service.js';

/** This process's FinOps settings, on the process's Firestore database. */
export const finopsSettings = createFinOpsSettingsService(firestoreFinOpsSettingsStore());
