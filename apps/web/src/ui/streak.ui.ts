/**
 * Streak UI - DEPRECATED
 *
 * This module has been replaced by the unified indicator system.
 * Streak tracking is now handled by:
 * - relationship-stage.service.ts - Streak calculation and storage
 * - unified-indicator.ui.ts - Visual display (in Journey modal)
 *
 * This file is kept for backward compatibility.
 *
 * @module ui/streak
 * @deprecated Use relationshipStageService.getMetrics().currentStreak instead
 */

import { relationshipStageService } from '../services/relationship-stage.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('StreakUI');

// ============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// ============================================================================

/**
 * Initialize streak UI (no-op, streak is now in relationship service).
 * @deprecated Streak tracking is handled by relationshipStageService
 */
export function initStreakUI(): void {
  log.info('initStreakUI called - streak now handled by relationshipStageService');
  // No-op: Streak is tracked by relationshipStageService
  // Visual display is in unified-indicator.ui.ts via Journey modal
}

/**
 * Get current streak count.
 * @deprecated Use relationshipStageService.getMetrics().currentStreak
 */
export function getStreakCount(): number {
  return relationshipStageService.getMetrics().currentStreak;
}

/**
 * Get longest streak ever achieved.
 * @deprecated Use relationshipStageService.getMetrics().longestStreak
 */
export function getLongestStreak(): number {
  return relationshipStageService.getMetrics().longestStreak;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const streakUI = {
  init: initStreakUI,
  getCount: getStreakCount,
  getLongest: getLongestStreak,
};

export default streakUI;
