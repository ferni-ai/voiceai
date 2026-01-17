/**
 * Session Initialization for Simple Utilities
 *
 * Call this when a user session starts to:
 * 1. Load their preferences from Firestore
 * 2. Hydrate the in-memory pattern store
 * 3. Check for proactive suggestions
 * 4. Register voice callback handlers
 *
 * This is what makes Ferni remember you across sessions.
 */

import { getLogger } from '../../../utils/safe-logger.js';
import { getUserPatterns } from './pattern-intelligence.js';
import { loadPatternsFromFirestore, getUpcomingMilestones } from './persistence.js';
import { registerVoiceCallbackHandler, type VoiceCallback } from './voice-callbacks.js';
import { getProactiveOpener, evaluateProactiveHooks } from './proactive-hooks.js';
import { loadLifeContext } from './context-integration.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

// ============================================================================
// SESSION STATE
// ============================================================================

interface SessionState {
  userId: string;
  initialized: boolean;
  preferencesLoaded: boolean;
  proactiveOffersReady: boolean;
  lifeContextLoaded: boolean;
}

const sessionStates = new Map<string, SessionState>();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize utilities for a user session
 * Call this at conversation start
 */
export async function initializeUtilitiesForSession(
  userId: string,
  options?: {
    voiceHandler?: (callback: VoiceCallback) => Promise<void>;
    skipProactive?: boolean;
  }
): Promise<{
  proactiveOpener: string | null;
  upcomingMilestones: Array<{ event: string; daysRemaining: number }>;
  suggestedTimers: Array<{ minutes: number; label: string }>;
}> {
  const log = getLogger();
  log.info({ userId }, 'Initializing utilities for session');

  // Create or get session state
  let state = sessionStates.get(userId);
  if (!state) {
    state = {
      userId,
      initialized: false,
      preferencesLoaded: false,
      proactiveOffersReady: false,
      lifeContextLoaded: false,
    };
    sessionStates.set(userId, state);
  }

  // 1. Load preferences from Firestore and hydrate in-memory patterns
  try {
    const persistedPatterns = await loadPatternsFromFirestore(userId);
    const inMemoryPatterns = getUserPatterns(userId);

    // Merge persisted patterns into in-memory
    if (persistedPatterns.commonTimerDurations) {
      inMemoryPatterns.patterns.commonTimerDurations = persistedPatterns.commonTimerDurations;
    }
    if (persistedPatterns.averageTipPercent !== undefined) {
      inMemoryPatterns.patterns.averageTipPercent = persistedPatterns.averageTipPercent;
    }
    if (persistedPatterns.tipCount !== undefined) {
      inMemoryPatterns.patterns.tipCount = persistedPatterns.tipCount;
    }
    if (persistedPatterns.frequentCities) {
      inMemoryPatterns.patterns.frequentCities = persistedPatterns.frequentCities;
    }
    if (persistedPatterns.countdownsTracked) {
      inMemoryPatterns.patterns.countdownsTracked = persistedPatterns.countdownsTracked;
    }
    if (persistedPatterns.preferences) {
      Object.assign(inMemoryPatterns.preferences, persistedPatterns.preferences);
    }

    state.preferencesLoaded = true;
    log.debug({ userId }, 'Loaded persisted utility preferences');
  } catch (err) {
    log.warn({ err, userId }, 'Could not load persisted preferences');
  }

  // 2. Register voice callback handler if provided
  if (options?.voiceHandler) {
    registerVoiceCallbackHandler(options.voiceHandler);
    log.debug({ userId }, 'Voice callback handler registered');
  }

  // 3. Load life context for enrichment
  let lifeContext;
  try {
    lifeContext = await loadLifeContext(userId);
    state.lifeContextLoaded = true;
    log.debug({ userId, events: lifeContext.upcomingEvents.length }, 'Loaded life context');
  } catch (err) {
    log.debug({ err, userId }, 'Could not load life context');
  }

  // 4. Get proactive opener
  let proactiveOpener: string | null = null;
  if (!options?.skipProactive) {
    try {
      proactiveOpener = await getProactiveOpener(userId, {
        lifeEvents: lifeContext?.upcomingEvents.map((e) => ({
          event: e.name,
          date: e.date,
          type: e.type,
        })),
        travelPlans: lifeContext?.travelPlans,
      });
      state.proactiveOffersReady = true;
    } catch (err) {
      log.debug({ err, userId }, 'Could not get proactive opener');
    }
  }

  // 5. Get upcoming milestones for countdowns
  let upcomingMilestones: Array<{ event: string; daysRemaining: number }> = [];
  try {
    const milestones = await getUpcomingMilestones(userId);
    upcomingMilestones = milestones.map((m) => ({
      event: m.event,
      daysRemaining: m.daysRemaining,
    }));
  } catch (err) {
    log.debug({ err, userId }, 'Could not get upcoming milestones');
  }

  // 6. Get suggested timers based on patterns
  const patterns = getUserPatterns(userId);
  const suggestedTimers = patterns.patterns.commonTimerDurations
    .filter((t) => t.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((t) => ({
      minutes: t.minutes,
      label: t.label || 'Timer',
    }));

  state.initialized = true;
  log.info(
    {
      userId,
      hasProactive: !!proactiveOpener,
      milestoneCount: upcomingMilestones.length,
      suggestedTimerCount: suggestedTimers.length,
    },
    'Utilities session initialized'
  );

  return {
    proactiveOpener,
    upcomingMilestones,
    suggestedTimers,
  };
}

/**
 * End a user session and sync patterns to Firestore
 */
export async function endUtilitiesSession(userId: string): Promise<void> {
  const log = getLogger();

  try {
    // Sync patterns to Firestore
    const { syncPatternsToFirestore } = await import('./persistence.js');
    const patterns = getUserPatterns(userId);
    await syncPatternsToFirestore(userId, patterns);

    log.debug({ userId }, 'Synced utility patterns on session end');
  } catch (err) {
    log.warn({ err, userId }, 'Could not sync patterns on session end');
  }

  // Clean up session state
  sessionStates.delete(userId);
}

/**
 * Check if session is initialized
 */
export function isSessionInitialized(userId: string): boolean {
  const state = sessionStates.get(userId);
  return state?.initialized ?? false;
}

/**
 * Get session state (for debugging)
 */
export function getSessionState(userId: string): SessionState | undefined {
  return sessionStates.get(userId);
}

// ============================================================================
// CONVERSATION HOOKS
// ============================================================================

/**
 * Hook to call at conversation start
 * Returns a proactive message if appropriate
 */
export async function onConversationStart(
  userId: string,
  voiceHandler?: (callback: VoiceCallback) => Promise<void>
): Promise<string | null> {
  const result = await initializeUtilitiesForSession(userId, { voiceHandler });

  // Build a natural opener if we have something
  const parts: string[] = [];

  // Proactive suggestion
  if (result.proactiveOpener) {
    parts.push(result.proactiveOpener);
  }

  // Milestone mention
  const todayMilestone = result.upcomingMilestones.find((m) => m.daysRemaining === 0);
  const tomorrowMilestone = result.upcomingMilestones.find((m) => m.daysRemaining === 1);

  if (todayMilestone) {
    parts.push(`🎉 Today's the day - it's ${todayMilestone.event}!`);
  } else if (tomorrowMilestone) {
    parts.push(`${tomorrowMilestone.event} is tomorrow!`);
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Hook to call when conversation ends
 */
export async function onConversationEnd(userId: string): Promise<void> {
  await endUtilitiesSession(userId);
}

/**
 * Hook for periodic proactive checks during long conversations
 */
export async function onConversationTick(
  userId: string,
  turnCount: number,
  lastActivityMinutes: number
): Promise<string | null> {
  // Only check periodically
  if (turnCount < 5) return null;
  if (lastActivityMinutes < 2) return null;

  try {
    const { shouldInjectProactiveSuggestion } = await import('./proactive-hooks.js');
    return await shouldInjectProactiveSuggestion(userId, turnCount, lastActivityMinutes);
  } catch {
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeUtilitiesForSession,
  endUtilitiesSession,
  isSessionInitialized,
  getSessionState,
  onConversationStart,
  onConversationEnd,
  onConversationTick,
};

// Re-export key types
export type { VoiceCallback } from './voice-callbacks.js';
export type { ProactiveOffer, ProactiveContext } from './proactive-hooks.js';
