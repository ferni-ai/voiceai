/**
 * Migration Module
 *
 * Tools for migrating between type formats as the system evolves.
 *
 * @module types/migration
 */

export {
  // Unified adapter
  UnifiedProfileAdapter,
  createUnifiedProfile,
  // Detection
  detectProfileFormat,
  diffProfiles,
  // Helpers
  mergeProfileUpdate,
  // Batch utilities
  migrateProfileBatch,
  // Full migration
  migrateToComposite,
  migrateToLegacy,
  needsMigration,
  type BatchMigrationResult,
  type ProfileFormat,
} from './profile-migrator.js';
