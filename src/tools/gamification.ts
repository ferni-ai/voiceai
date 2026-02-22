/**
 * Gamification Re-export Shim (Backward Compatibility)
 *
 * Gamification v2 lives in domains/habits/ with Firestore persistence.
 * This shim re-exports from the canonical location so existing imports
 * from `tools/gamification.js` continue to work.
 *
 * PREFERRED: Import from domains/habits directly:
 *   import { createGamificationToolsV2 } from './domains/habits/gamification.js';
 *   import { BADGE_DEFINITIONS, TITLE_PROGRESSION } from './domains/habits/gamification-constants.js';
 *
 * @see RATIONALIZATION.md - Tool domain moves
 * @see domains/habits/gamification.ts - Canonical implementation
 */

export { BADGE_DEFINITIONS, TITLE_PROGRESSION } from './domains/habits/gamification-constants.js';
export {
  createGamificationToolsV2,
  default as createGamificationTools,
} from './domains/habits/gamification.js';

/** Level formula: level = floor(sqrt(totalXP / 100)) + 1. Used by tests and legacy callers. */
export function calculateLevel(totalXP: number): { level: number; progress: number } {
  const xp = Math.max(0, totalXP);
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const currentLevelXP = Math.pow(level - 1, 2) * 100;
  const nextLevelXP = Math.pow(level, 2) * 100;
  const progress =
    nextLevelXP > currentLevelXP
      ? Math.round(((xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100)
      : 100;
  return { level, progress };
}
