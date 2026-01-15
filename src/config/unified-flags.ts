/**
 * Unified Feature Flags Facade
 *
 * Provides a unified API to access all feature flag systems in Ferni:
 *
 * 1. **Application Flags** (config/feature-flags.ts)
 *    - Static, env-var driven
 *    - Used for: debug toggles, experimental features, life coach domains
 *
 * 2. **Trust System Flags** (services/feature-flags.ts)
 *    - Dynamic, Firestore-backed, user-specific
 *    - Used for: gradual rollout of trust features with kill switches
 *
 * 3. **Voice Humanization Flags** (config/voice-humanization-flags.ts)
 *    - Session-scoped, percentage rollout
 *    - Used for: audio intelligence features (prosody, laughter, rhythm)
 *
 * USAGE:
 *   import { flags } from '../config/unified-flags.js';
 *
 *   // Check debug flags
 *   if (flags.debug.agent) { ... }
 *
 *   // Check trust system feature
 *   if (await flags.trust.isEnabled('trust.reading-between-lines', userId)) { ... }
 *
 *   // Check voice humanization
 *   if (flags.voiceHumanization.isSessionEnabled(sessionId)) { ... }
 *
 * @module @ferni/config/unified-flags
 */

import { createLogger } from '../utils/safe-logger.js';

// Application flags
import {
  getFeatureFlags,
  isDebugEnabled,
  isExperimentalEnabled,
  isFeatureEnabled,
  isHumanizationEnabled,
  isEvalOpsEnabled,
  isLifeCoachDomainEnabled,
  isPersonalJourneyEnabled,
  type FeatureFlags,
  type LifeCoachDomain,
} from './feature-flags.js';

// Voice humanization flags
import {
  getFlags as getVoiceHumanizationFlags,
  getSessionFlags as getVoiceHumanizationSessionFlags,
  isEnabledForSession as isVoiceHumanizationEnabledForSession,
  isFeatureEnabled as isVoiceHumanizationFeatureEnabled,
  type VoiceHumanizationFlags,
} from './voice-humanization-flags.js';

// Trust system flags - lazy loaded to avoid Firestore initialization
let trustFlagsModule: typeof import('../services/deployment/feature-flags.js') | null = null;

async function getTrustFlags() {
  if (!trustFlagsModule) {
    trustFlagsModule = await import('../services/deployment/feature-flags.js');
  }
  return trustFlagsModule;
}

const log = createLogger({ module: 'UnifiedFlags' });

// =============================================================================
// UNIFIED FLAGS FACADE
// =============================================================================

/**
 * Unified flags facade providing access to all flag systems
 */
export const flags = {
  // =========================================================================
  // APPLICATION FLAGS (config/feature-flags.ts)
  // =========================================================================

  /**
   * Debug flags - check if debug logging is enabled for a category
   */
  debug: {
    get agent() {
      return isDebugEnabled('agent');
    },
    get humanizing() {
      return isDebugEnabled('humanizing');
    },
    get memory() {
      return isDebugEnabled('memory');
    },
    get tools() {
      return isDebugEnabled('tools');
    },
    get handoff() {
      return isDebugEnabled('handoff');
    },
    get audio() {
      return isDebugEnabled('audio');
    },
    get music() {
      return isDebugEnabled('music');
    },
    get itunes() {
      return isDebugEnabled('itunes');
    },
    /** Check any debug category */
    is: (category: keyof FeatureFlags['debug']) => isDebugEnabled(category),
  },

  /**
   * Experimental features
   */
  experimental: {
    get voiceEmotionDetection() {
      return isExperimentalEnabled('voiceEmotionDetection');
    },
    get geminiEmotionAnalysis() {
      return isExperimentalEnabled('geminiEmotionAnalysis');
    },
    get crossSessionThreading() {
      return isExperimentalEnabled('crossSessionThreading');
    },
    get proactiveInsights() {
      return isExperimentalEnabled('proactiveInsights');
    },
    /** Check any experimental feature */
    is: (feature: keyof FeatureFlags['experimental']) => isExperimentalEnabled(feature),
  },

  /**
   * Humanization (response naturalization)
   */
  humanization: {
    get enabled() {
      return isHumanizationEnabled();
    },
    /** Check specific humanization feature by path */
    is: (path: string) => isFeatureEnabled(`humanization.${path}`),
  },

  /**
   * EvalOps (quality evaluation)
   */
  evalops: {
    get enabled() {
      return isEvalOpsEnabled();
    },
  },

  /**
   * Personal Journey Awareness
   */
  personalJourney: {
    get enabled() {
      return isPersonalJourneyEnabled();
    },
  },

  /**
   * Life Coach Domains
   */
  lifeCoach: {
    /** Check if a domain is enabled (crisis always returns true) */
    isDomainEnabled: (domain: LifeCoachDomain) => isLifeCoachDomainEnabled(domain),
  },

  /**
   * Get full application flags object
   */
  getAll: () => getFeatureFlags(),

  /**
   * Check any feature by dot-notation path
   * @example flags.is('humanization.disfluencies')
   */
  is: (path: string) => isFeatureEnabled(path),

  // =========================================================================
  // TRUST SYSTEM FLAGS (services/feature-flags.ts)
  // =========================================================================

  /**
   * Trust system flags - requires async because backed by Firestore
   */
  trust: {
    /**
     * Check if a trust feature is enabled for a user
     * @param flagId - Trust flag ID (e.g., 'trust.reading-between-lines')
     * @param userId - Optional user ID for user-specific checks
     */
    isEnabled: async (flagId: string, userId?: string): Promise<boolean> => {
      const { isEnabled } = await getTrustFlags();
      return isEnabled(flagId as Parameters<typeof isEnabled>[0], userId);
    },

    /**
     * Get all trust flags
     */
    getAll: async () => {
      const { getAllFlags } = await getTrustFlags();
      return getAllFlags();
    },

    /**
     * Execute callback only if trust flag is enabled
     */
    withFlag: async <T>(
      flagId: string,
      userId: string | undefined,
      callback: () => T | Promise<T>,
      fallback?: T
    ): Promise<T | undefined> => {
      const { withFlagAsync } = await getTrustFlags();
      return withFlagAsync(
        flagId as Parameters<typeof withFlagAsync>[0],
        userId,
        callback as () => Promise<T>,
        fallback
      );
    },
  },

  // =========================================================================
  // VOICE HUMANIZATION FLAGS (config/voice-humanization-flags.ts)
  // =========================================================================

  /**
   * Voice humanization flags - session-scoped audio features
   */
  voiceHumanization: {
    /**
     * Get current voice humanization flags
     */
    getFlags: (): VoiceHumanizationFlags => getVoiceHumanizationFlags(),

    /**
     * Get flags for a specific session (with rollout check)
     */
    getSessionFlags: (sessionId: string) => getVoiceHumanizationSessionFlags(sessionId),

    /**
     * Check if voice humanization is enabled for a session
     */
    isSessionEnabled: (sessionId: string) => isVoiceHumanizationEnabledForSession(sessionId),

    /**
     * Check if a specific voice humanization feature is enabled
     */
    isFeatureEnabled: (feature: Parameters<typeof isVoiceHumanizationFeatureEnabled>[0]) =>
      isVoiceHumanizationFeatureEnabled(feature),

    // Convenience getters for common checks
    get prosodyTurnPrediction() {
      return isVoiceHumanizationFeatureEnabled('enableProsodyTurnPrediction');
    },
    get microInterruptions() {
      return isVoiceHumanizationFeatureEnabled('enableMicroInterruptions');
    },
    get laughterDetection() {
      return isVoiceHumanizationFeatureEnabled('enableLaughterDetection');
    },
    get rhythmMirroring() {
      return isVoiceHumanizationFeatureEnabled('enableRhythmMirroring');
    },
    get emotionalContagion() {
      return isVoiceHumanizationFeatureEnabled('enableEmotionalContagion');
    },
    get voiceAuthentication() {
      return isVoiceHumanizationFeatureEnabled('enableVoiceAuthentication');
    },
    get liveBackchanneling() {
      return isVoiceHumanizationFeatureEnabled('enableLiveBackchanneling');
    },
    get responseAnticipation() {
      return isVoiceHumanizationFeatureEnabled('enableResponseAnticipation');
    },
  },
};

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

/**
 * Quick check if any debug mode is enabled
 */
export function isAnyDebugEnabled(): boolean {
  const f = getFeatureFlags();
  return Object.values(f.debug).some((v) => v === true);
}

/**
 * Get summary of all enabled flags (for logging/diagnostics)
 */
export async function getFlagsSummary(): Promise<{
  debug: string[];
  experimental: string[];
  trustEnabled: number;
  voiceHumanizationRollout: number;
}> {
  const appFlags = getFeatureFlags();
  const voiceFlags = getVoiceHumanizationFlags();

  let trustEnabledCount = 0;
  try {
    const { getAllFlags } = await getTrustFlags();
    const allTrust = getAllFlags();
    trustEnabledCount = Object.values(allTrust).filter((f) => f.enabled).length;
  } catch {
    // Firestore not available
  }

  return {
    debug: Object.entries(appFlags.debug)
      .filter(([, v]) => v)
      .map(([k]) => k),
    experimental: Object.entries(appFlags.experimental)
      .filter(([, v]) => v)
      .map(([k]) => k),
    trustEnabled: trustEnabledCount,
    voiceHumanizationRollout: voiceFlags.rolloutPercentage,
  };
}

/**
 * Log current flag state (for diagnostics)
 */
export async function logFlagState(): Promise<void> {
  const summary = await getFlagsSummary();
  log.info(
    {
      enabledDebug: summary.debug,
      enabledExperimental: summary.experimental,
      trustFeaturesEnabled: summary.trustEnabled,
      voiceHumanizationRollout: `${summary.voiceHumanizationRollout}%`,
    },
    '🚩 Feature flags state'
  );
}

// Re-export types
export type { FeatureFlags } from './feature-flags.js';
export type { VoiceHumanizationFlags } from './voice-humanization-flags.js';

export default flags;
