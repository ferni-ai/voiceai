/**
 * Session State Persistence Module
 *
 * Handles persisting various state types to user profile at session end:
 * - Handoff state
 * - Cross-session threads
 * - Emotional memory
 * - Intelligence state
 * - Personal journey
 * - Human memory signals
 *
 * @module session-manager/state-persistence
 */

import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { SessionServices } from '../types.js';
import type { ConversationTurn } from '../../memory/index.js';
import type { ConversationSummary } from './summarization.js';
import { applyIntelligenceToProfile } from '../intelligence-persistence.js';

const log = getLogger();

// ============================================================================
// HANDOFF STATE
// ============================================================================

/**
 * Persist handoff state (meeting counts, last topics) to profile.
 */
export async function persistHandoffState(
  profile: UserProfile,
  handoffState: SessionServices['handoffState']
): Promise<UserProfile> {
  try {
    const { getMeetingCounts, getLastTopicsPerPersona } =
      await import('../../tools/handoff-state.js');
    const meetingCounts = getMeetingCounts(handoffState);
    const lastTopicsPerPersona = getLastTopicsPerPersona(handoffState);

    (profile.customData as Record<string, unknown>).meetingCounts = meetingCounts;
    (profile.customData as Record<string, unknown>).lastTopicsPerPersona = lastTopicsPerPersona;

    log.debug(
      { meetingCounts: Object.keys(meetingCounts).length },
      'Persisted handoff state to profile'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to persist handoff state (non-fatal)');
  }

  return profile;
}

// ============================================================================
// CROSS-SESSION THREADS
// ============================================================================

/**
 * Persist cross-session conversation threads and follow-ups.
 */
export async function persistCrossSessionThreads(
  profile: UserProfile,
  crossSessionThreader: SessionServices['crossSessionThreader']
): Promise<UserProfile> {
  try {
    const threadData = crossSessionThreader.getAllData();
    const openThreadCount = threadData.threads.filter((t) => t.status === 'open').length;
    const pendingFollowUps = threadData.followUps.filter((f) => !f.delivered).length;

    if (openThreadCount > 0 || pendingFollowUps > 0) {
      (profile.customData as Record<string, unknown>).openThreads = threadData.threads;
      (profile.customData as Record<string, unknown>).promisedFollowUps = threadData.followUps;

      log.info(
        { openThreads: openThreadCount, pendingFollowUps },
        'Persisted cross-session threads to profile'
      );
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to persist cross-session threads (non-fatal)');
  }

  return profile;
}

// ============================================================================
// EMOTIONAL MEMORY
// ============================================================================

/**
 * Persist emotional moments from the session to profile.
 */
export async function persistEmotionalMemory(
  profile: UserProfile,
  emotionalMemory: SessionServices['emotionalMemory']
): Promise<UserProfile> {
  try {
    const moments = emotionalMemory.exportMoments();
    if (moments.length > 0) {
      // Keep only recent moments (last 50) to avoid profile bloat
      const recentMoments = moments.slice(-50);
      (profile.customData as Record<string, unknown>).emotionalMoments = recentMoments;

      log.info({ momentCount: recentMoments.length }, 'Persisted emotional memory to profile');
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to persist emotional memory (non-fatal)');
  }

  return profile;
}

// ============================================================================
// INTELLIGENCE STATE
// ============================================================================

/**
 * Apply learned intelligence patterns to user profile.
 */
export async function persistIntelligenceState(
  profile: UserProfile,
  userId: string
): Promise<UserProfile> {
  try {
    profile = applyIntelligenceToProfile(profile, userId);
    log.info({ userId }, '🧠 Applied intelligence state to profile');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to apply intelligence state (non-fatal)');
  }

  return profile;
}

// ============================================================================
// PERSONAL JOURNEY
// ============================================================================

/**
 * Persist personal journey data (rhythm, seasonal, chapters) to profile.
 */
export async function persistPersonalJourney(
  profile: UserProfile,
  userId: string,
  summary: ConversationSummary | null
): Promise<UserProfile> {
  try {
    const { getPersonalJourneyForPersistence, updateJourneyFromConversation } =
      await import('../personal-journey/session-integration.js');

    // Update chapter detection from conversation
    if (summary) {
      await updateJourneyFromConversation(userId, {
        topics: summary.mainTopics || [],
        emotions: summary.emotionalArc ? [summary.emotionalArc] : [],
        keyMoments: summary.keyPoints?.slice(0, 3),
        wins: summary.keyPoints?.filter((kp) =>
          /achieved|completed|succeeded|won|accomplished/i.test(kp)
        ),
        struggles: summary.keyPoints?.filter((kp) =>
          /struggled|difficult|hard|worried|anxious|stressed/i.test(kp)
        ),
      });
    }

    // Get journey data for persistence
    const journeyData = getPersonalJourneyForPersistence(userId);
    if (journeyData && (journeyData.rhythm || journeyData.seasonal || journeyData.chapters)) {
      profile.personalJourney = journeyData;
      log.info(
        {
          userId,
          hasRhythm: !!journeyData.rhythm,
          hasSeasonal: !!journeyData.seasonal,
          hasChapters: !!journeyData.chapters,
          deliveryRecords: journeyData.deliveryHistory?.length || 0,
        },
        '🌟 Personal journey data persisted to profile'
      );
    }

    // Capture seasonal snapshot if needed
    if (summary) {
      const { captureSeasonalSnapshotIfNeeded } =
        await import('../personal-journey/session-integration.js');
      const captured = await captureSeasonalSnapshotIfNeeded(userId, {
        emotionalState: summary.emotionalArc || 'neutral',
        activeThemes: summary.mainTopics || [],
        keyMoments: summary.keyPoints || [],
      });
      if (captured) {
        log.info({ userId }, '🌸 Seasonal snapshot captured');
      }
    }
  } catch (error) {
    log.warn(
      { error: String(error), userId },
      'Failed to persist personal journey data (non-fatal)'
    );
  }

  return profile;
}

// ============================================================================
// HUMAN MEMORY SIGNALS
// ============================================================================

/**
 * Extract and merge human memory signals from conversation.
 */
export async function extractHumanMemorySignals(
  profile: UserProfile,
  userId: string,
  personaId: string | undefined,
  turns: ConversationTurn[],
  summary: ConversationSummary | null
): Promise<UserProfile> {
  try {
    const { extractHumanSignals, mergeSignalsIntoMemory } =
      await import('../../memory/human-signal-extractor.js');

    if (turns.length > 0) {
      const signals = extractHumanSignals(turns, {
        userId,
        personaId: personaId || 'ferni',
        userName: profile.preferredName || profile.name,
        existingMemory: profile.humanMemory,
        sessionEmotion: summary?.emotionalArc,
      });

      const totalSignals = Object.values(signals).reduce((sum, arr) => sum + arr.length, 0);

      if (totalSignals > 0) {
        profile.humanMemory = mergeSignalsIntoMemory(profile.humanMemory, signals);
        log.info(
          {
            userId,
            totalSignals,
            dates: signals.importantDates.length,
            values: signals.values.length,
            dreams: signals.dreams.length,
            fears: signals.fears.length,
            growth: signals.growthMarkers.length,
            comfort: signals.comfortPatterns.length,
          },
          '🌟 Human memory signals extracted and merged'
        );
      }
    }
  } catch (error) {
    log.warn(
      { error: String(error), userId },
      'Failed to extract human memory signals (non-fatal)'
    );
  }

  return profile;
}

// ============================================================================
// HUMANIZING STATE
// ============================================================================

/**
 * Apply humanizing state updates to profile.
 */
export async function applyHumanizingState(
  profile: UserProfile,
  updates: import('../humanizing-state.js').HumanizingStateUpdate[],
  userId: string
): Promise<UserProfile> {
  if (updates.length === 0) {
    return profile;
  }

  try {
    const {
      getHumanizingState,
      mergeHumanizingStateUpdate,
      applyHumanizingStateToProfile,
      logHumanizingStateSummary,
    } = await import('../humanizing-state.js');

    let humanizingState = getHumanizingState(profile);

    for (const update of updates) {
      humanizingState = mergeHumanizingStateUpdate(humanizingState, update);
    }

    const updatedProfile = applyHumanizingStateToProfile(profile, humanizingState);
    logHumanizingStateSummary(humanizingState, userId);
    return updatedProfile;
  } catch (humanizingError) {
    log.warn({ error: String(humanizingError) }, 'Failed to persist humanizing state (non-fatal)');
    return profile;
  }
}

// ============================================================================
// COMBINED PERSISTENCE
// ============================================================================

/**
 * Options for persisting all session state.
 */
export interface PersistAllStateOptions {
  profile: UserProfile;
  userId: string;
  sessionId: string;
  services: SessionServices;
  personaId: string | undefined;
  summary: ConversationSummary | null;
  turns: ConversationTurn[];
}

/**
 * Persist all state to user profile in sequence.
 *
 * Handles: handoff state, threads, emotional memory, intelligence,
 * personal journey, and human memory signals.
 */
export async function persistAllState(options: PersistAllStateOptions): Promise<UserProfile> {
  const { profile, userId, services, personaId, summary, turns } = options;

  let updatedProfile = profile;

  // Initialize customData if needed
  if (!updatedProfile.customData) {
    updatedProfile.customData = {};
  }

  // Persist handoff state
  updatedProfile = await persistHandoffState(updatedProfile, services.handoffState);

  // Persist cross-session threads
  updatedProfile = await persistCrossSessionThreads(updatedProfile, services.crossSessionThreader);

  // Persist emotional memory
  updatedProfile = await persistEmotionalMemory(updatedProfile, services.emotionalMemory);

  // Apply intelligence state
  updatedProfile = await persistIntelligenceState(updatedProfile, userId);

  // Persist personal journey
  updatedProfile = await persistPersonalJourney(updatedProfile, userId, summary);

  // Extract human memory signals
  updatedProfile = await extractHumanMemorySignals(updatedProfile, userId, personaId, turns, summary);

  return updatedProfile;
}
