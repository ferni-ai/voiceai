/**
 * Cognitive Session Hooks
 *
 * Lifecycle hooks for cognitive memory integration.
 * Call these from the voice agent at session start/end.
 *
 * Usage:
 * - onCognitiveSessionStart: Call after session.start()
 * - onCognitiveSessionEnd: Call in disconnect handler before other cleanup
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { UserProfile } from '../../types/user-profile.js';
import type { ReasoningStyle } from '../../personas/cognitive-types.js';
import {
  initializeCognitiveSession,
  endCognitiveSession,
  syncCognitiveToProfile,
  loadCognitiveFromProfile,
  getCognitiveSession,
} from '../memory/cognitive-memory.js';
import { cognitiveBroadcast } from './cognitive-broadcast.js';

const logger = getLogger();

// ============================================================================
// SESSION START
// ============================================================================

export interface CognitiveSessionStartOptions {
  userId: string;
  personaId: string;
  userProfile?: UserProfile | null;
  sessionId: string;
}

/**
 * Initialize cognitive intelligence for a new session.
 * Call this after session.start() in the voice agent.
 */
export async function onCognitiveSessionStart(
  options: CognitiveSessionStartOptions
): Promise<void> {
  const { userId, personaId, userProfile, sessionId } = options;

  try {
    // Initialize cognitive session (loads from profile or Firestore)
    const sessionState = await initializeCognitiveSession(userId, personaId, userProfile ?? null);

    // If we have a profile, also load from it for completeness
    if (userProfile) {
      loadCognitiveFromProfile(userId, personaId, userProfile);
    }

    // Broadcast session start
    cognitiveBroadcast.broadcast({
      type: 'session_start',
      userId,
      personaId,
      detectedStyle: sessionState.userStyle,
      styleConfidence: sessionState.userStyleConfidence,
      timestamp: new Date(),
    });

    logger.info(
      {
        userId,
        personaId,
        sessionId,
        detectedStyle: sessionState.userStyle,
        styleConfidence: sessionState.userStyleConfidence,
      },
      '🧠 Cognitive session started'
    );
  } catch (error) {
    logger.warn({ error, userId, personaId }, 'Failed to initialize cognitive session');
    // Non-fatal - cognitive features will work without persistence
  }
}

// ============================================================================
// SESSION END
// ============================================================================

export interface CognitiveSessionEndOptions {
  userId: string;
  personaId: string;
  sessionId: string;
  sessionDurationMs: number;
}

/**
 * End cognitive session and save learnings.
 * Call this in the disconnect handler before other cleanup.
 *
 * @returns Updated cognitive data to merge into user profile
 */
export async function onCognitiveSessionEnd(options: CognitiveSessionEndOptions): Promise<{
  approachesUsed: number;
  topicsExplained: number;
  userStyle?: ReasoningStyle;
} | null> {
  const { userId, personaId, sessionId, sessionDurationMs } = options;

  try {
    // End the cognitive session
    const sessionSummary = await endCognitiveSession(userId, personaId);

    // Broadcast session end
    cognitiveBroadcast.broadcast({
      type: 'session_end',
      userId,
      personaId,
      approachesUsed: sessionSummary.approachesUsed,
      topicsExplained: sessionSummary.topicsExplained,
      duration: sessionDurationMs,
      timestamp: new Date(),
    });

    logger.info(
      {
        userId,
        personaId,
        sessionId,
        approachesUsed: sessionSummary.approachesUsed,
        topicsExplained: sessionSummary.topicsExplained,
        userStyle: sessionSummary.userStyle,
        durationMs: sessionDurationMs,
      },
      '🧠 Cognitive session ended'
    );

    return sessionSummary;
  } catch (error) {
    logger.warn({ error, userId, personaId }, 'Failed to end cognitive session');
    return null;
  }
}

// ============================================================================
// PROFILE SYNC
// ============================================================================

/**
 * Sync cognitive data to user profile.
 * Call this before saving user profile to persist cognitive learnings.
 */
export async function syncCognitiveDataToProfile(
  userId: string,
  profile: UserProfile
): Promise<UserProfile> {
  try {
    return await syncCognitiveToProfile(userId, profile);
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to sync cognitive data to profile');
    return profile;
  }
}

// ============================================================================
// CURRENT SESSION INFO
// ============================================================================

/**
 * Get current cognitive session info for a user/persona.
 * Useful for debugging or displaying in UI.
 */
export function getCognitiveSessionInfo(
  userId: string,
  personaId: string
): {
  active: boolean;
  userStyle?: ReasoningStyle;
  styleConfidence: number;
  approachesUsed: number;
  topicsExplained: number;
} {
  const session = getCognitiveSession(userId, personaId);

  if (!session) {
    return {
      active: false,
      styleConfidence: 0,
      approachesUsed: 0,
      topicsExplained: 0,
    };
  }

  return {
    active: true,
    userStyle: session.userStyle,
    styleConfidence: session.userStyleConfidence,
    approachesUsed: session.approachesUsed.length,
    topicsExplained: session.topicsExplained.length,
  };
}

export default {
  onCognitiveSessionStart,
  onCognitiveSessionEnd,
  syncCognitiveDataToProfile,
  getCognitiveSessionInfo,
};
