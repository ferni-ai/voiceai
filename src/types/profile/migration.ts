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

// ============================================================================
// LEGACY ALIASES (for backward compatibility)
// ============================================================================

import {
  detectProfileFormat,
  migrateToComposite,
  migrateToLegacy,
} from '../migration/profile-migrator.js';
import type { UserProfile } from '../user-profile.js';
import type { CompositeUserProfile } from './index.js';

/**
 * @deprecated Use `migrateToComposite()` instead.
 */
export function migrateUserProfile(legacy: UserProfile): CompositeUserProfile {
  return migrateToComposite(legacy);
}

/**
 * @deprecated Use `detectProfileFormat(profile) === 'legacy'` instead.
 */
export function isLegacyProfile(profile: unknown): profile is UserProfile {
  return detectProfileFormat(profile) === 'legacy';
}

/**
 * @deprecated Use `detectProfileFormat(profile) === 'composite'` instead.
 */
export function isCompositeProfile(profile: unknown): profile is CompositeUserProfile {
  return detectProfileFormat(profile) === 'composite';
}

/**
 * @deprecated Use `createUnifiedProfile(profile).composite` instead.
 */
export function ensureCompositeProfile(
  profile: UserProfile | CompositeUserProfile
): CompositeUserProfile {
  const format = detectProfileFormat(profile);
  if (format === 'composite') {
    return profile as CompositeUserProfile;
  }
  if (format === 'legacy') {
    return migrateToComposite(profile as UserProfile);
  }
  throw new Error('Unknown profile format');
}

/**
 * @deprecated Use `migrateToLegacy()` instead.
 */
export function toLegacyProfile(composite: CompositeUserProfile): UserProfile {
  return migrateToLegacy(composite);
}
