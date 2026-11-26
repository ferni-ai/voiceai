/**
 * Where the FinOps settings are kept, so every API instance and every restart reads the
 * same figures. adapters/firestore-finops-settings-store.ts implements it on Firestore.
 *
 * @module services/observability/finops-settings/ports/finops-settings-store
 */
import type { FinOpsSettingsPatch, SavedFinOpsSettings } from '../domain/finops-settings.js';

export interface FinOpsSettingsStore {
  /** The saved settings, or null when nothing has been saved. Throws when the store is down. */
  read: () => Promise<SavedFinOpsSettings | null>;
  /** Merge `patch` (thresholds key by key) into the saved settings, stamped with who and when. */
  merge: (
    patch: FinOpsSettingsPatch,
    meta: { updatedAt: string; updatedBy: string }
  ) => Promise<void>;
}
