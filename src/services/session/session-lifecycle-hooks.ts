/**
 * Session Lifecycle Hooks
 *
 * Integrates session events with outreach suppression, presence tracking,
 * persona affinity updates, and correction context loading.
 *
 * These hooks should be called at key session lifecycle points:
 * - Session start
 * - Session heartbeat (periodic)
 * - Session end
 * - User correction
 * - Persona handoff
 *
 * @module services/session/session-lifecycle-hooks
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getRedisCache } from '../../memory/redis-cache.js';
import { personaAffinity } from '../superhuman/persona-affinity.js';
import { userCorrections } from '../superhuman/user-corrections.js';
import { outreachHistory } from '../outreach/outreach-history.js';

const log = getLogger().child({ module: 'session-lifecycle' });

// ============================================================================
// SESSION START
// ============================================================================

/**
 * Called when a session starts
 */
export async function onSessionStart(
  userId: string,
  sessionId: string,
  personaId: string,
  channel: 'voice' | 'text' | 'web' = 'voice'
): Promise<{
  correctionContext: string[];
  recommendedPersona?: string;
}> {
  try {
    const redis = getRedisCache();

    // 1. Set user presence (for outreach suppression)
    await redis.set(`presence:${userId}`, 'active', 7200); // 2 hours max

    // 2. Clear outreach suppression (user is now available via session)
    await redis.delete(`suppress_outreach:${userId}`);

    // 3. Register user session
    await redis.setUserSession(userId, sessionId);

    // 4. Load correction context (past mistakes to avoid)
    const recentCorrections = await userCorrections.getAll(userId, { limit: 5 });
    const correctionContext = recentCorrections.map(
      (c) => `User previously corrected: "${c.whatFerniSaid}" → "${c.whatUserCorrected}"`
    );

    // 5. Load persona affinities for routing recommendations
    const affinities = await personaAffinity.getAll(userId);
    const topAffinity = affinities.find(
      (a) => a.personaId !== personaId && a.emotionalResonance === 'high'
    );

    log.info(
      { userId, sessionId, personaId, channel, correctionCount: correctionContext.length },
      'Session started - lifecycle hooks complete'
    );

    return {
      correctionContext,
      recommendedPersona: topAffinity?.personaId,
    };
  } catch (error) {
    log.error({ error: String(error), userId, sessionId }, 'Session start hooks failed');
    return { correctionContext: [] };
  }
}

// ============================================================================
// SESSION HEARTBEAT
// ============================================================================

/**
 * Called periodically during session to maintain presence
 * Should be called every 30-60 seconds
 */
export async function onSessionHeartbeat(
  userId: string,
  sessionId: string,
  personaId: string
): Promise<void> {
  try {
    const redis = getRedisCache();

    // Refresh presence
    await redis.set(`presence:${userId}`, 'active', 120); // 2 more minutes
  } catch (error) {
    log.warn({ error: String(error), userId, sessionId }, 'Session heartbeat failed');
  }
}

// ============================================================================
// SESSION END
// ============================================================================

/**
 * Called when a session ends
 */
export async function onSessionEnd(
  userId: string,
  sessionId: string,
  sessionData: {
    personaId: string;
    duration: number; // minutes
    topics: string[];
    sentiment: 'positive' | 'neutral' | 'negative';
    userEngagement: 'low' | 'medium' | 'high';
  }
): Promise<void> {
  try {
    const redis = getRedisCache();

    // 1. Clear presence
    await redis.delete(`presence:${userId}`);

    // 2. Update outreach suppression (give user a break after session)
    const suppressDuration = sessionData.sentiment === 'negative' ? 7200 : 1800; // 2 hours if negative, 30 min otherwise
    await redis.set(`suppress_outreach:${userId}`, 'true', suppressDuration);

    // 3. Clear session
    await redis.deleteSession(userId);

    // 4. Update persona affinity based on session quality
    await personaAffinity.updateAfterSession(userId, {
      personaId: sessionData.personaId,
      duration: sessionData.duration,
      topics: sessionData.topics,
      sentiment: sessionData.sentiment,
      userEngagement: sessionData.userEngagement,
    });

    // 5. Record persona interaction
    await personaAffinity.recordInteraction(userId, {
      personaId: sessionData.personaId,
      interactionType: 'session',
      topics: sessionData.topics,
      sentiment: sessionData.sentiment,
      duration: sessionData.duration,
      outcome: sessionData.sentiment === 'positive' ? 'successful' : 'needs_follow_up',
    });

    log.info(
      { userId, sessionId, duration: sessionData.duration, sentiment: sessionData.sentiment },
      'Session ended - lifecycle hooks complete'
    );
  } catch (error) {
    log.error({ error: String(error), userId, sessionId }, 'Session end hooks failed');
  }
}

// ============================================================================
// USER CORRECTION
// ============================================================================

/**
 * Called when a user corrects something Ferni said
 */
export async function onUserCorrection(
  userId: string,
  sessionId: string,
  originalStatement: string,
  correctedStatement: string,
  context: string,
  personaId: string
): Promise<void> {
  try {
    await userCorrections.record(userId, {
      whatFerniSaid: originalStatement,
      whatUserCorrected: correctedStatement,
      correctInformation: correctedStatement,
    });

    log.info({ userId, sessionId, personaId }, 'User correction recorded');
  } catch (error) {
    log.error({ error: String(error), userId, sessionId }, 'Failed to record user correction');
  }
}

// ============================================================================
// PERSONA HANDOFF
// ============================================================================

/**
 * Called when a handoff occurs during a session
 */
export async function onPersonaHandoff(
  userId: string,
  sessionId: string,
  fromPersona: string,
  toPersona: string,
  reason: string
): Promise<void> {
  try {
    // Record handoff for learning
    await personaAffinity.recordHandoff(userId, {
      fromPersona,
      toPersona,
      topics: [reason.split(' ')[0]], // Extract first word as topic hint
      userApproved: true,
      successful: true,
    });

    // Record interaction with the "from" persona
    await personaAffinity.recordInteraction(userId, {
      personaId: fromPersona,
      interactionType: 'handoff',
      topics: [reason],
      sentiment: 'neutral',
      duration: 0,
      outcome: 'handed_off',
    });

    log.info({ userId, sessionId, fromPersona, toPersona, reason }, 'Persona handoff recorded');
  } catch (error) {
    log.error({ error: String(error), userId, sessionId }, 'Failed to record persona handoff');
  }
}

// ============================================================================
// EMOTIONAL STATE TRACKING (During Session)
// ============================================================================

/**
 * Update emotional state during session
 */
export async function updateEmotionalState(
  userId: string,
  state: {
    primary: string;
    secondary?: string;
    intensity: number;
    confidence: number;
    triggers?: string[];
  }
): Promise<void> {
  try {
    const redis = getRedisCache();
    await redis.set(
      `emotion:${userId}`,
      JSON.stringify({
        ...state,
        timestamp: new Date().toISOString(),
      }),
      300 // 5 minutes
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to update emotional state');
  }
}

/**
 * Update voice biomarkers during session
 */
export async function updateVoiceBiomarkers(
  userId: string,
  biomarkers: {
    fatigue: number;
    stress: number;
    hydration?: number;
    pitch?: 'low' | 'normal' | 'high' | 'variable';
    pace?: 'slow' | 'normal' | 'fast' | 'rushed';
    strain?: boolean;
  }
): Promise<void> {
  try {
    const redis = getRedisCache();
    await redis.set(
      `biomarker:${userId}`,
      JSON.stringify({
        ...biomarkers,
        timestamp: new Date().toISOString(),
      }),
      300 // 5 minutes
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to update voice biomarkers');
  }
}

// ============================================================================
// OUTREACH INTEGRATION
// ============================================================================

/**
 * Check if user is available for outreach
 */
export async function isUserAvailableForOutreach(
  userId: string
): Promise<{ available: boolean; reason?: string }> {
  try {
    const redis = getRedisCache();

    // Check if in active session
    const presence = await redis.get(`presence:${userId}`);
    if (presence === 'active') {
      return { available: false, reason: 'User is in active session' };
    }

    // Check suppression
    const suppressed = await redis.get(`suppress_outreach:${userId}`);
    if (suppressed) {
      return { available: false, reason: 'Post-session cooldown active' };
    }

    return { available: true };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to check outreach availability');
    // Fail open - allow outreach if check fails
    return { available: true };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const sessionLifecycle = {
  onStart: onSessionStart,
  onHeartbeat: onSessionHeartbeat,
  onEnd: onSessionEnd,
  onCorrection: onUserCorrection,
  onHandoff: onPersonaHandoff,
  updateEmotionalState,
  updateVoiceBiomarkers,
  isAvailableForOutreach: isUserAvailableForOutreach,
};

export default sessionLifecycle;
