/**
 * Check-in Badge UI - DEPRECATED
 *
 * This module has been replaced by the unified indicator system.
 * The check-in functionality is now handled by:
 * - checkin.service.ts - API polling and events
 * - unified-indicator.ui.ts - Visual display
 *
 * This file is kept for backward compatibility and re-exports
 * the service initialization.
 *
 * @module ui/checkin-badge
 * @deprecated Use checkin.service.ts and unified-indicator.ui.ts instead
 */

import { checkinService } from '../services/checkin.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CheckinBadge');

// ============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// ============================================================================

/**
 * Initialize check-in badge (now just initializes the service).
 * @deprecated Use checkinService.init() directly
 */
export function initCheckinBadgeUI(): void {
  log.info('initCheckinBadgeUI called - delegating to checkinService');
  checkinService.init();
}

/**
 * Dispose check-in badge.
 * @deprecated Use checkinService.dispose() directly
 */
export function disposeCheckinBadgeUI(): void {
  checkinService.dispose();
}

/**
 * Trigger a check-in (for testing).
 * @deprecated Use checkinService.forceCheck() directly
 */
export function triggerCheckin(): void {
  void checkinService.forceCheck();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const checkinBadgeUI = {
  init: initCheckinBadgeUI,
  dispose: disposeCheckinBadgeUI,
  trigger: triggerCheckin,
};

export default checkinBadgeUI;
