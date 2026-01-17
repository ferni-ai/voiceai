/**
 * Moments System Migration Utilities
 *
 * Provides helpers for migrating from old toast/whisper/celebration APIs
 * to the new unified Moments System.
 *
 * Usage:
 * 1. Run the migration script to find all callsites
 * 2. Update imports to use new moments API
 * 3. Old APIs continue to work via shims in index.ts
 *
 * @module ui/moments/migration
 */

import { moments, toast, whisper } from './index.js';

// ============================================================================
// MIGRATION MAPPING
// ============================================================================

/**
 * Maps old toast.* calls to new moments.whisper() calls
 *
 * Old API:
 * - toast.info(message)
 * - toast.success(message)
 * - toast.warning(message)
 * - toast.error(message)
 *
 * New API:
 * - moments.whisper(message, { type: 'info' })
 * - moments.whisper(message, { type: 'success' })
 * - moments.whisper(message, { type: 'warning' })
 * - moments.whisper(message, { type: 'error' })
 */
export const TOAST_MIGRATION = {
  'toast.info': "moments.whisper(message, { type: 'info' })",
  'toast.success': "moments.whisper(message, { type: 'success' })",
  'toast.warning': "moments.whisper(message, { type: 'warning' })",
  'toast.error': "moments.whisper(message, { type: 'error' })",
};

/**
 * Maps old whisper.* calls to new moments.* calls
 *
 * Old API:
 * - whisper.info(message)
 * - whisper.success(message)
 * - whisper.celebration(amount, reason)
 *
 * New API:
 * - moments.whisper(message, { type: 'info' })
 * - moments.whisper(message, { type: 'success' })
 * - moments.notice(reason, { type: 'seeds', amount })
 */
export const WHISPER_MIGRATION = {
  'whisper.info': "moments.whisper(message, { type: 'info' })",
  'whisper.success': "moments.whisper(message, { type: 'success' })",
  'whisper.warning': "moments.whisper(message, { type: 'warning' })",
  'whisper.error': "moments.whisper(message, { type: 'error' })",
  'whisper.celebration': "moments.notice(reason, { type: 'seeds', amount })",
};

/**
 * Maps old celebration.* calls to new moments.celebrate() calls
 *
 * Old API:
 * - celebrate(type, config)
 * - celebrateSmallWin(config)
 * - celebrateBigWin(config)
 *
 * New API:
 * - moments.celebrate(type, config)
 */
export const CELEBRATION_MIGRATION = {
  'celebrate': 'moments.celebrate(type, config)',
  'celebrateSmallWin': "moments.celebrate('small_win', config)",
  'celebrateBigWin': "moments.celebrate('big_win', config)",
  'celebrateMilestone': "moments.celebrate('badge', config)",
  'celebrateStreak': "moments.celebrate('streak', { count })",
  'celebrateTeamUnlock': "moments.celebrate('team_unlock', { personaName })",
};

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Re-export old APIs for backward compatibility.
 * These are the same shims from index.ts, re-exported for clarity.
 */
export { toast, whisper };

/**
 * Log migration suggestions when old APIs are used (dev only)
 */
export function enableMigrationWarnings(): void {
  if (process.env.NODE_ENV !== 'development') return;

  const originalToast = { ...toast };
  const originalWhisper = { ...whisper };

  // Wrap toast methods
  (toast.info as unknown) = (message: string) => {
    console.warn('[Migration] Replace toast.info() with moments.whisper(message, { type: "info" })');
    return originalToast.info(message);
  };

  (toast.success as unknown) = (message: string) => {
    console.warn('[Migration] Replace toast.success() with moments.whisper(message, { type: "success" })');
    return originalToast.success(message);
  };

  // Wrap whisper methods
  (whisper.celebration as unknown) = (amount: number, reason?: string) => {
    console.warn('[Migration] Replace whisper.celebration() with moments.notice(reason, { type: "seeds", amount })');
    return originalWhisper.celebration(amount, reason);
  };
}

// ============================================================================
// MIGRATION SCRIPT OUTPUT
// ============================================================================

/**
 * Files that import from toast.ui.ts (need migration):
 *
 * apps/web/src/ui/sleep-settings.ui.ts
 * apps/web/src/app.ts
 * apps/web/src/ui/agent-page-builder.ui.ts
 * apps/web/src/ui/memory-lane.ui.ts
 * apps/web/src/ui/ferni-birthday.ui.ts
 * apps/web/src/ui/streak.ui.ts
 * apps/web/src/ui/bookmark.ui.ts
 * apps/web/src/ui/memory-feedback.ui.ts
 */

/**
 * Files that import from whisper.ui.ts (need migration):
 *
 * 60 files - see migration scan output
 * Key files:
 * - apps/web/src/app.ts
 * - apps/web/src/ui/*.ui.ts (most UI files)
 * - apps/web/src/services/*.service.ts (several services)
 */

/**
 * Files that import from celebration.ui.ts (need migration):
 *
 * apps/web/src/ui/dev-panel.ui.ts
 * apps/web/src/app.ts
 * apps/web/src/app/data-message-handlers.ts
 * apps/web/src/ui/index.ts
 * apps/web/src/ui/brand-ui.ts
 * apps/web/src/ui/ferni-milestones.ui.ts
 * apps/web/src/services/ritual-engine.service.ts
 * apps/web/src/services/progressive-features.service.ts
 * apps/web/src/services/delight.service.ts
 * apps/web/src/services/brand-system.ts
 */

// ============================================================================
// RECOMMENDED MIGRATION ORDER
// ============================================================================

/**
 * Migration order (by impact):
 *
 * Phase 1: Core files
 * - apps/web/src/app.ts (main entry point)
 * - apps/web/src/ui/index.ts (UI re-exports)
 *
 * Phase 2: High-usage UI files
 * - apps/web/src/ui/seeds-display.ui.ts
 * - apps/web/src/ui/streak.ui.ts
 * - apps/web/src/ui/team.ui.ts
 *
 * Phase 3: Services
 * - apps/web/src/services/ritual-engine.service.ts
 * - apps/web/src/services/brand-system.ts
 *
 * Phase 4: Everything else (60+ files)
 * - Can be done incrementally
 * - Old APIs continue to work
 */
