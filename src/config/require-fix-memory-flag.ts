/**
 * REQUIRE_FIX_MEMORY: lets four per-user stores persist to Firestore.
 *
 * They reached firebase-admin through a bare require(), which throws in the
 * production ESM build, so they have never written anything. Fixing the import
 * makes them write, so it waits behind this switch.
 *
 * On: these stores read and write under bogle_users/{userId}/, which account
 * deletion (eraseUserRecord) removes recursively:
 *   - embedding_intelligence/*   (intelligence/predictive/embeddings/embedding-persistence)
 *   - ambient/current_state, settings/ambient_preferences   (services/ambient-mode)
 *   - health_summaries/{date}, settings/health_preferences  (services/health)
 *   - info_preferences/current   (tools/domains/information/preferences)
 * Off (the default): they stay in memory only, as they always have.
 *
 * The visual-memory store is NOT covered by this switch: its images go to
 * Cloud Storage (visual-memories/{userId}/...), made public, which account
 * deletion does not touch.
 *
 * Read on every store access, so a test (or a restart with new env) sees the
 * current value.
 *
 * @module config/require-fix-memory-flag
 */

export const REQUIRE_FIX_MEMORY_ENV = 'REQUIRE_FIX_MEMORY';

/** True only when REQUIRE_FIX_MEMORY is 'on' or 'true'. */
export function isRequireFixMemoryEnabled(): boolean {
  const value = process.env[REQUIRE_FIX_MEMORY_ENV]?.trim().toLowerCase();
  return value === 'on' || value === 'true';
}
