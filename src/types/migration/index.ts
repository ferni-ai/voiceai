/**
 * Migration Module
 *
 * Tools for migrating between type formats as the system evolves.
 *
 * @module types/migration
 */

export {
  // Detection
  detectProfileFormat,
  needsMigration,
  type ProfileFormat,
  // Full migration
  migrateToComposite,
  migrateToLegacy,
  // Unified adapter
  UnifiedProfileAdapter,
  createUnifiedProfile,
  // Batch utilities
  migrateProfileBatch,
  type BatchMigrationResult,
  // Helpers
  mergeProfileUpdate,
  diffProfiles,
} from './profile-migrator.js';
