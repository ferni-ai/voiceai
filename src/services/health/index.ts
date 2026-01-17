/**
 * Health Integration Service
 *
 * > "Better than human means knowing, not guessing."
 *
 * Integrates with Apple HealthKit / Google Fit to provide
 * superhuman awareness of user's physical state.
 *
 * ## Privacy First
 *
 * - All data sharing is opt-in
 * - We store summaries, not raw health records
 * - User can disable at any time
 * - Data never leaves Ferni
 *
 * ## What We Know
 *
 * | Data Point | Source | Insight |
 * |------------|--------|---------|
 * | Sleep | HealthKit | "Rough night? You only got 4 hours." |
 * | HRV | HealthKit | "Your stress has been elevated this week" |
 * | Activity | HealthKit | "You've been less active - everything okay?" |
 * | Mindfulness | HealthKit | "You haven't meditated in a while" |
 *
 * ## Usage
 *
 * ```typescript
 * import { healthService } from './services/health';
 *
 * // Get health context for LLM injection
 * const context = await healthService.getContextInjection(userId);
 *
 * // Handle sync from mobile app
 * const result = await healthService.handleSync(request);
 * ```
 *
 * @module services/health
 */

import { createLogger } from '../../utils/safe-logger.js';

// Re-export types
export type {
  HealthSummary,
  HealthContext,
  HealthPreferences,
  HealthTrends,
  HealthSyncRequest,
  HealthSyncResponse,
  HealthAlert,
} from './types.js';

// Re-export store functions
export {
  storeHealthSummary,
  getHealthSummary,
  getRecentHealthSummaries,
  getHealthPreferences,
  updateHealthPreferences,
  handleHealthSync,
  buildHealthContext,
  getHealthContextInjection,
  healthDataStore,
} from './health-data-store.js';

const log = createLogger({ module: 'health-service' });

// ============================================================================
// UNIFIED API
// ============================================================================

import {
  handleHealthSync,
  buildHealthContext,
  getHealthContextInjection,
  getHealthPreferences,
  updateHealthPreferences,
  getRecentHealthSummaries,
} from './health-data-store.js';
import type {
  HealthSyncRequest,
  HealthContext,
  HealthPreferences,
  HealthSummary,
} from './types.js';

/**
 * Unified Health Service API
 */
export const healthService = {
  /**
   * Handle health sync from mobile app
   */
  handleSync: handleHealthSync,

  /**
   * Build health context for a user
   */
  buildContext: buildHealthContext,

  /**
   * Get health context injection for LLM
   */
  getContextInjection: getHealthContextInjection,

  /**
   * Get user's health preferences
   */
  getPreferences: getHealthPreferences,

  /**
   * Update user's health preferences
   */
  updatePreferences: updateHealthPreferences,

  /**
   * Get recent health summaries
   */
  getRecentSummaries: getRecentHealthSummaries,

  /**
   * Check if user has health integration enabled
   */
  isEnabled: async (userId: string): Promise<boolean> => {
    const prefs = await getHealthPreferences(userId);
    return prefs?.enabled ?? false;
  },

  /**
   * Enable health integration for user
   */
  enable: async (userId: string): Promise<void> => {
    await updateHealthPreferences(userId, {
      enabled: true,
      shareSleep: true,
      shareStress: true,
      shareActivity: true,
      shareWellness: true,
      shareCycle: false, // Very sensitive, default off
      proactiveHealthMentions: true,
    });
    log.info({ userId }, 'Health integration enabled');
  },

  /**
   * Disable health integration for user
   */
  disable: async (userId: string): Promise<void> => {
    await updateHealthPreferences(userId, {
      enabled: false,
    });
    log.info({ userId }, 'Health integration disabled');
  },

  /**
   * Check if we should mention health proactively
   */
  shouldMentionHealth: async (userId: string, context: HealthContext): Promise<boolean> => {
    if (!context.hasHealthData) return false;

    const prefs = await getHealthPreferences(userId);
    if (!prefs?.proactiveHealthMentions) return false;

    // Only mention if there's something notable
    return !!(context.sleepInsight || context.stressInsight);
  },
};

// ============================================================================
// CONTEXT BUILDER INTEGRATION
// ============================================================================

import type { ContextInjection } from '../../intelligence/context-builders/core/types.js';

/**
 * Build health awareness context injection
 *
 * Priority: 76 (high but below safety at 80+)
 */
export async function buildHealthAwarenessInjection(
  userId: string
): Promise<ContextInjection | null> {
  try {
    const context = await buildHealthContext(userId);

    if (!context.hasHealthData || !context.summary) {
      return null;
    }

    const content = await getHealthContextInjection(userId);
    if (!content) return null;

    return {
      id: 'health-awareness',
      source: 'health-service',
      content,
      priority: 'standard',
      category: 'better-than-human',
      confidence: context.confidence === 'high' ? 0.9 : context.confidence === 'medium' ? 0.7 : 0.5,
    };
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to build health injection');
    return null;
  }
}

export default healthService;
