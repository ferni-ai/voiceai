/**
 * Memory Lifecycle Module
 *
 * Provides lifecycle management for memories including decay,
 * consolidation, and preference prediction.
 *
 * @module memory/lifecycle
 */

// Types
export type {
  DecayConfig,
  DecayResult,
  DecayBatchResult,
  ProtectionFactor,
  ConsolidationConfig,
  ConsolidationGroup,
  ConsolidationResult,
  ConsolidationBatchResult,
  PreferencePredictorConfig,
  PredictedPreference,
  MaintenanceJobConfig,
  MaintenanceJobResult,
  LifecycleManager,
  MemoryHealthStats,
} from './types.js';

export {
  DEFAULT_DECAY_CONFIG,
  DEFAULT_CONSOLIDATION_CONFIG,
  DEFAULT_PREFERENCE_PREDICTOR_CONFIG,
} from './types.js';

// Decay Manager
export {
  DecayManager,
  getDecayManager,
  resetDecayManager,
} from './decay-manager.js';

// Consolidation Manager
export {
  ConsolidationManager,
  getConsolidationManager,
  resetConsolidationManager,
} from './consolidation-manager.js';

// Preference Predictor
export {
  PreferencePredictor,
  getPreferencePredictor,
  resetPreferencePredictor,
  type PreferenceDataPoint,
} from './preference-predictor.js';

// Scheduled Maintenance
export {
  ScheduledMaintenance,
  getScheduledMaintenance,
  resetScheduledMaintenance,
  DEFAULT_MAINTENANCE_JOBS,
} from './scheduled-maintenance.js';
