/**
 * Moments System Initialization
 *
 * Initializes the complete Moments System:
 * - Injects styles
 * - Initializes badge display
 * - Connects to data sources
 * - Attaches event listeners
 *
 * Call `initMomentsSystem()` during app initialization.
 *
 * @module ui/moments/init
 */

import { createLogger } from '../../utils/logger.js';
import { initBadgeDisplay, resetBadgeDisplay } from './badges.js';
import {
  attachDataListeners,
  detachDataListeners,
  syncBadgeData,
} from './data-connector.js';
import { getMomentsManager, resetMomentsManager } from './manager.js';
import { resetTrophyRoom } from './trophy-room.js';

const log = createLogger('MomentsInit');

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the complete Moments System.
 *
 * Should be called once during app startup, after the avatar is rendered.
 *
 * @example
 * import { initMomentsSystem } from './ui/moments/init.js';
 *
 * // In app initialization
 * await initMomentsSystem();
 */
export async function initMomentsSystem(): Promise<void> {
  if (isInitialized) {
    log.debug('Moments system already initialized');
    return;
  }

  log.info('Initializing Moments System');

  try {
    // 1. Initialize the MomentsManager (injects styles)
    getMomentsManager();

    // 2. Initialize badge display (creates badge container near avatar)
    initBadgeDisplay();

    // 3. Attach event listeners for data updates
    attachDataListeners();

    // 4. Sync initial data
    await syncBadgeData();

    isInitialized = true;
    log.info('Moments System initialized successfully');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize Moments System');
    throw error;
  }
}

/**
 * Destroy the Moments System.
 *
 * Useful for cleanup during HMR or page unload.
 */
export function destroyMomentsSystem(): void {
  if (!isInitialized) return;

  log.info('Destroying Moments System');

  detachDataListeners();
  resetMomentsManager();
  resetBadgeDisplay();
  resetTrophyRoom();

  isInitialized = false;
}

/**
 * Check if the Moments System is initialized.
 */
export function isMomentsSystemInitialized(): boolean {
  return isInitialized;
}

// ============================================================================
// HMR SUPPORT
// ============================================================================

// Clean up on HMR to prevent duplicate elements
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    destroyMomentsSystem();
  });
}
