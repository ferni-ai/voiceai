/**
 * Soul UI - Ferni's Living Presence
 *
 * Subtle presence that makes Ferni feel alive:
 * - First launch experience (simple, warm)
 * - Persona transitions (smooth handoffs)
 *
 * Philosophy: Zen simplicity. Present but not distracting.
 *
 * @example
 * import { initSoul } from './ui/soul.ui.js';
 * await initSoul();
 */

import { createLogger } from '../utils/logger.js';

// Soul components
import {
  dismissAwakening,
  hasSeenAwakening,
  resetAwakening,
  showFerniAwakens,
} from './ferni-awakens.ui.js';

import {
  celebrationBurst,
  disposePersonaMagic,
  empathyPulse,
  initPersonaMagic,
  performMagicalHandoff,
  type MagicalHandoffOptions,
} from './persona-magic.ui.js';

const log = createLogger('Soul');

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize Ferni's soul - the living presence system
 */
export async function initSoul(
  options: {
    /** Show first launch experience if user hasn't seen it */
    showFirstLaunch?: boolean;
    /** Enable persona magic transitions */
    enablePersonaMagic?: boolean;
  } = {}
): Promise<void> {
  if (isInitialized) {
    log.debug('Soul already initialized');
    return;
  }

  const { showFirstLaunch = true, enablePersonaMagic = true } = options;

  log.info('Initializing soul');

  // 1. Show first launch experience if needed
  if (showFirstLaunch && !hasSeenAwakening()) {
    log.info('First launch - showing awakening experience');
    await showFerniAwakens();
  }

  // 2. Initialize persona magic
  if (enablePersonaMagic) {
    initPersonaMagic();
    log.debug('Persona magic initialized');
  }

  // 3. Set up event listeners
  setupEventListeners();

  isInitialized = true;
  log.info('Soul initialized');
}

/**
 * Dispose of all soul components
 */
export function disposeSoul(): void {
  disposePersonaMagic();
  isInitialized = false;
  log.debug('Soul disposed');
}

// ============================================================================
// EVENT INTEGRATION
// ============================================================================

function setupEventListeners(): void {
  // Persona switch -> magical handoff
  window.addEventListener('ferni:switch-persona', ((e: CustomEvent) => {
    const { fromId, toId, fromName, toName, banter } = e.detail;
    void performMagicalHandoff({
      fromId,
      toId,
      fromName,
      toName,
      banter,
    });
  }) as EventListener);

  // Celebration events
  window.addEventListener('ferni:celebration', () => {
    void celebrationBurst();
  });

  // Empathy moments
  window.addEventListener('ferni:empathy', () => {
    void empathyPulse();
  });

  // Milestone achievements - celebrate!
  window.addEventListener('ferni:milestone', () => {
    void celebrationBurst();
  });

  // Stage changes
  window.addEventListener('ferni:stage-change', () => {
    void celebrationBurst();
  });

  // Team unlock
  window.addEventListener('ferni:team-unlock', () => {
    void celebrationBurst();
  });

  log.debug('Soul event listeners set up');
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Manually show the first launch experience
 */
export async function showFirstLaunchExperience(): Promise<void> {
  resetAwakening();
  await showFerniAwakens();
}

/**
 * Perform a magical handoff between personas
 */
export async function switchPersonaMagically(options: MagicalHandoffOptions): Promise<void> {
  await performMagicalHandoff(options);
}

/**
 * Trigger a celebration
 */
export async function triggerCelebration(): Promise<void> {
  await celebrationBurst();
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export {
  celebrationBurst,
  dismissAwakening,
  disposePersonaMagic,
  empathyPulse,
  hasSeenAwakening,
  // Persona Magic
  initPersonaMagic,
  performMagicalHandoff,
  resetAwakening,
  // Ferni Awakens
  showFerniAwakens,
};

export type { MagicalHandoffOptions };

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

const soul = {
  init: initSoul,
  dispose: disposeSoul,
  showFirstLaunch: showFirstLaunchExperience,
  switchPersona: switchPersonaMagically,
  celebrate: triggerCelebration,
};

export default soul;
