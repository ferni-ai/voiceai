/**
 * Voice ID Badge UI - DEPRECATED
 *
 * This module has been replaced by the unified indicator system.
 * Voice ID status is now displayed in:
 * - unified-indicator.ui.ts - Shows shield icon when verifying
 * - journey.ui.ts - Shows Voice ID enrollment status
 *
 * This file is kept for backward compatibility and to dispatch
 * voice verification events that the unified indicator listens to.
 *
 * @module ui/voice-id-badge
 * @deprecated Use unified-indicator.ui.ts and voice-auth.service.ts instead
 */

import { createLogger } from '../utils/logger.js';
import { getVoiceAuthService } from '../services/voice-auth.service.js';

const log = createLogger('VoiceIdBadge');

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;

// ============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// ============================================================================

/**
 * Initialize voice ID badge (now just sets up event dispatching).
 * @deprecated The unified indicator handles visual display
 */
export function initVoiceIdBadge(): void {
  if (isInitialized) return;

  // Set up listeners to dispatch events for the unified indicator
  window.addEventListener('ferni:voice-enrolled', () => {
    log.info('Voice enrolled - unified indicator will update');
  });

  window.addEventListener('ferni:voice-unenrolled', () => {
    log.info('Voice unenrolled - unified indicator will update');
  });

  isInitialized = true;
  log.info('Voice ID badge initialized (delegating to unified indicator)');
}

/**
 * Update badge status based on enrollment.
 * @deprecated Status is now shown in Journey modal
 */
export async function updateBadgeStatus(): Promise<void> {
  try {
    const voiceAuth = getVoiceAuthService();
    const profile = await voiceAuth.getProfile();
    log.debug('Voice ID status checked', { enrolled: profile.enrolled });
  } catch (error) {
    log.warn('Failed to check voice enrollment status:', error);
  }
}

/**
 * Show verifying animation.
 * @deprecated Unified indicator shows shield icon when verifying
 */
export function showVerifying(): void {
  window.dispatchEvent(new CustomEvent('ferni:voice-verify-start'));
  log.debug('Voice verification started - unified indicator notified');
}

/**
 * Hide verifying animation.
 * @deprecated Unified indicator handles this automatically
 */
export function hideVerifying(): void {
  window.dispatchEvent(new CustomEvent('ferni:voice-verify-end'));
  log.debug('Voice verification ended - unified indicator notified');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  init: initVoiceIdBadge,
  updateStatus: updateBadgeStatus,
  showVerifying,
  hideVerifying,
};
