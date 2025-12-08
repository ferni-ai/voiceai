/**
 * Simple Utilities Integration for Voice Agent
 *
 * This module wires the "Better Than Human" utilities system into the voice agent.
 * Import and call these functions from voice-agent.ts to enable:
 * - Timer voice callbacks (actually speaks when timer completes)
 * - Cross-session memory (remembers preferences)
 * - Proactive suggestions (offers help before asked)
 * - Context enrichment (connects to life events)
 *
 * FEATURE FLAGS:
 * - simple-utilities (master toggle)
 * - simple-utilities-voice-callbacks
 * - simple-utilities-pattern-learning
 * - simple-utilities-proactive (percentage rollout)
 * - simple-utilities-persistence
 * - simple-utilities-context-enrichment
 * - simple-utilities-insights
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { voice } from '@livekit/agents';

// Feature flags for controlled rollout
import { getSimpleUtilitiesConfig } from '../../services/feature-flags.js';

// Import from simple utilities domain
import {
  registerVoiceCallbackHandler,
  onConversationStart,
  onConversationEnd,
  onConversationTick,
  type VoiceCallback,
} from '../../tools/domains/simple-utilities/index.js';

// ============================================================================
// TYPES
// ============================================================================

type AgentSession = voice.AgentSession<unknown>;

interface UtilitiesIntegrationConfig {
  session: AgentSession;
  userId: string;
  enableProactive?: boolean;
  enableVoiceCallbacks?: boolean;
}

interface UtilitiesIntegrationResult {
  proactiveOpener: string | null;
  cleanup: () => Promise<void>;
}

// ============================================================================
// MAIN INTEGRATION
// ============================================================================

/**
 * Initialize utilities integration for a voice agent session
 *
 * Call this after creating the AgentSession in voice-agent.ts:
 *
 * ```typescript
 * const utilities = await initializeUtilitiesIntegration({
 *   session,
 *   userId,
 *   enableProactive: true,
 *   enableVoiceCallbacks: true,
 * });
 *
 * // Use proactive opener in greeting if available
 * if (utilities.proactiveOpener) {
 *   greeting += ` ${utilities.proactiveOpener}`;
 * }
 *
 * // On disconnect, call cleanup
 * await utilities.cleanup();
 * ```
 */
export async function initializeUtilitiesIntegration(
  config: UtilitiesIntegrationConfig
): Promise<UtilitiesIntegrationResult> {
  const { session, userId, enableProactive = true, enableVoiceCallbacks = true } = config;
  const log = getLogger();

  // Check feature flags for controlled rollout
  const featureConfig = getSimpleUtilitiesConfig();

  // If master toggle is off, skip initialization entirely
  if (!featureConfig.enabled) {
    log.info({ userId }, 'Simple utilities disabled via feature flag');
    return {
      proactiveOpener: null,
      cleanup: async () => {
        /* no-op */
      },
    };
  }

  log.info(
    {
      userId,
      enableProactive,
      enableVoiceCallbacks,
      featureConfig,
    },
    'Initializing utilities integration'
  );

  // 1. Register voice callback handler (for timers, milestones, etc.)
  // Only if feature flag allows AND caller requested it
  if (enableVoiceCallbacks && featureConfig.voiceCallbacks) {
    registerVoiceCallbackHandler(createVoiceCallbackHandler(session));
    log.debug('Voice callback handler registered');
  }

  // 2. Initialize session and get proactive opener
  // Only if feature flag allows AND caller requested it
  let proactiveOpener: string | null = null;

  if (enableProactive && featureConfig.proactive) {
    try {
      proactiveOpener = await onConversationStart(
        userId,
        enableVoiceCallbacks && featureConfig.voiceCallbacks
          ? createVoiceCallbackHandler(session)
          : undefined
      );

      if (proactiveOpener) {
        log.info({ userId, opener: proactiveOpener.slice(0, 50) }, 'Got proactive opener');
      }
    } catch (err) {
      log.warn({ err, userId }, 'Could not get proactive opener');
    }
  }

  // 3. Return result with cleanup function
  // Only persist if feature flag allows
  return {
    proactiveOpener,
    cleanup: async () => {
      if (featureConfig.persistence) {
        try {
          await onConversationEnd(userId);
          log.debug({ userId }, 'Utilities session cleaned up');
        } catch (err) {
          log.warn({ err, userId }, 'Error during utilities cleanup');
        }
      }
    },
  };
}

/**
 * Create a voice callback handler bound to a session
 */
function createVoiceCallbackHandler(session: AgentSession) {
  const log = getLogger();

  return async (callback: VoiceCallback): Promise<void> => {
    log.info(
      {
        type: callback.type,
        priority: callback.priority,
        hasFollowUp: !!callback.followUpQuestion,
      },
      'Processing voice callback'
    );

    try {
      // Speak the main message
      session.say(callback.message, { allowInterruptions: true });

      // Small pause then follow-up question if present
      if (callback.followUpQuestion) {
        // Wait for main message to likely finish
        await sleep(1500);
        session.say(callback.followUpQuestion, { allowInterruptions: true });
      }

      // TODO: Play sound effect if specified
      // This would require audio file handling
      // if (callback.sound) {
      //   await playUtilitySound(callback.sound);
      // }
    } catch (err) {
      log.error({ err, callback }, 'Failed to execute voice callback');
    }
  };
}

/**
 * Check for proactive suggestions during conversation
 * Call this periodically during long conversations
 */
export async function checkForProactiveSuggestions(
  userId: string,
  turnCount: number,
  lastActivityMinutes: number
): Promise<string | null> {
  try {
    return await onConversationTick(userId, turnCount, lastActivityMinutes);
  } catch (err) {
    getLogger().debug({ err }, 'Could not check for proactive suggestions');
    return null;
  }
}

/**
 * Weave proactive opener into greeting naturally
 */
export function weaveProactiveIntoGreeting(
  greeting: string,
  proactiveOpener: string | null,
  probability = 0.3
): string {
  if (!proactiveOpener) return greeting;
  if (Math.random() > probability) return greeting;

  // Natural ways to weave in proactive suggestions
  const transitions = ['By the way,', 'Oh, and', 'Also,', 'Quick thought:', 'Before we dive in,'];

  const transition = transitions[Math.floor(Math.random() * transitions.length)];

  // Make opener lowercase if it starts with a capital (to flow better)
  const lowerOpener = proactiveOpener.charAt(0).toLowerCase() + proactiveOpener.slice(1);

  return `${greeting} ${transition} ${lowerOpener}`;
}

// ============================================================================
// HELPERS
// ============================================================================

async function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeUtilitiesIntegration,
  checkForProactiveSuggestions,
  weaveProactiveIntoGreeting,
};
