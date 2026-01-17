/**
 * Profile Migration Utilities (Re-exports)
 *
 * This module re-exports migration utilities from the canonical location
 * at `types/migration/profile-migrator.ts`.
 *
 * For new code, prefer importing directly from `types/migration/`.
 *
 * @module types/profile/migration
 */

// Re-export everything from the canonical location
export {
  createUnifiedProfile,
  // Detection utilities
  detectProfileFormat,
  diffProfiles,
  // Field-level utilities
  mergeProfileUpdate,
  // Batch utilities
  migrateProfileBatch,
  // Migration functions
  migrateToComposite,
  migrateToLegacy,
  needsMigration,
  // Unified adapter (recommended for transition period)
  UnifiedProfileAdapter,
  type BatchMigrationResult,
  type ProfileFormat,
} from '../migration/profile-migrator.js';
