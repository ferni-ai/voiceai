/**
 * Session Gap Awareness Context Builder
 *
 * Surfaces how long it's been since the user's last session, with warm
 * guidance on how to acknowledge the reconnection naturally.
 *
 * "Better Than Human" means noticing: "It's been a while - good to hear from you"
 * without making it awkward ("Where have you been?").
 *
 * Gap Tiers:
 * - 1-2 days: Normal cadence, no special injection
 * - 3-5 days: Warm acknowledgment opportunity
 * - 6-14 days: Check-in with care, no pressure
 * - 14+ days: Celebrate the reconnection
 *
 * @module intelligence/context-builders/awareness/session-gap-awareness
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import { createHintInjection, createHighInjection, registerContextBuilder } from '../index.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { getFirestoreDb } from '../../../services/superhuman/firestore-utils.js';

const log = createLogger({ module: 'context:session-gap-awareness' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface SessionGapConfig {
  /** Days before we inject warm acknowledgment */
  warmAcknowledgmentDays: number;
  /** Days before we inject check-in guidance */
  checkInGuidanceDays: number;
  /** Days before we inject reconnection celebration */
  reconnectionDays: number;
}

const config: SessionGapConfig = {
  warmAcknowledgmentDays: 3,
  checkInGuidanceDays: 6,
  reconnectionDays: 14,
};

// ============================================================================
// SESSION GAP LOADER
// ============================================================================

interface SessionGapData {
  daysSinceLastSession: number;
  lastSessionDate: Date | null;
  lastSessionMood?: string;
  totalSessions: number;
}

async function loadSessionGapData(userId: string): Promise<SessionGapData | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    // Try to get user profile with session data
    const profileSnap = await db.collection('bogle_users').doc(userId).get();

    if (!profileSnap.exists) {
      return null;
    }

    const profile = profileSnap.data();
    const lastSessionTimestamp = profile?.lastSessionTimestamp || profile?.lastActiveAt;

    if (!lastSessionTimestamp) {
      return null;
    }

    const lastSessionDate =
      lastSessionTimestamp instanceof Date
        ? lastSessionTimestamp
        : lastSessionTimestamp.toDate
          ? lastSessionTimestamp.toDate()
          : new Date(lastSessionTimestamp);

    const daysSinceLastSession = Math.floor(
      (Date.now() - lastSessionDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      daysSinceLastSession,
      lastSessionDate,
      lastSessionMood: profile?.lastSessionMood,
      totalSessions: profile?.totalConversations || 0,
    };
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to load session gap data');
    return null;
  }
}

// ============================================================================
// GUIDANCE GENERATORS
// ============================================================================

function getWarmAcknowledgmentGuidance(days: number): string {
  return `[SESSION GAP: ${days} days since last conversation]

It's been a few days. A warm acknowledgment lands well:
- "Hey, good to hear from you"
- "Nice to connect again"

Don't overdo it or make it weird. Just a brief, warm beat.`;
}

function getCheckInGuidance(days: number, lastMood?: string): string {
  const moodContext = lastMood ? `\nLast time, they seemed ${lastMood}. ` : '';

  return `[SESSION GAP: ${days} days since last conversation]
${moodContext}
They've been quiet for a bit. Check in warmly without pressure:
- "I was thinking about you"
- "Good to hear your voice"
- Don't ask "where have you been?" - feels accusatory
- Don't assume something was wrong

Let them share if they want to. Meet them where they are.`;
}

function getReconnectionGuidance(days: number, lastMood?: string): string {
  const moodContext = lastMood
    ? `\nLast time you talked, they were feeling ${lastMood}. Check in gently.`
    : '';

  return `[SESSION GAP: ${days} days - it's been a while!]
${moodContext}
This is a meaningful reconnection moment. Celebrate it:
- "Hey, it's really good to hear from you"
- "I've been thinking about you"
- Show genuine warmth at the reconnection

DON'T:
- Ask "where have you been?" (pressure)
- Act like nothing happened (dismissive)
- Assume they were avoiding you

DO:
- Express genuine warmth
- Be present in this moment
- Let them lead on what's been happening`;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildSessionGapAwareness(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { services, userData } = input;
  const userId = services?.userId;
  const turnCount = userData?.turnCount || 0;

  // Only inject on first few turns (session start)
  if (!userId || turnCount > 3) {
    return [];
  }

  try {
    const gapData = await loadSessionGapData(userId);

    if (!gapData) {
      return [];
    }

    const { daysSinceLastSession, lastSessionMood, totalSessions } = gapData;

    // First-time user - no gap guidance needed
    if (totalSessions === 0) {
      return [];
    }

    // Normal cadence (1-2 days) - no injection
    if (daysSinceLastSession < config.warmAcknowledgmentDays) {
      return [];
    }

    const injections: ContextInjection[] = [];

    // 14+ days - reconnection celebration
    if (daysSinceLastSession >= config.reconnectionDays) {
      const guidance = getReconnectionGuidance(daysSinceLastSession, lastSessionMood);
      injections.push(
        createHighInjection('session_gap_reconnection', guidance, {
          category: 'session_awareness',
        })
      );
      log.debug(
        { userId, days: daysSinceLastSession, tier: 'reconnection' },
        '🔄 Session gap awareness: reconnection'
      );
    }
    // 6-14 days - check-in guidance
    else if (daysSinceLastSession >= config.checkInGuidanceDays) {
      const guidance = getCheckInGuidance(daysSinceLastSession, lastSessionMood);
      injections.push(
        createHighInjection('session_gap_checkin', guidance, {
          category: 'session_awareness',
        })
      );
      log.debug(
        { userId, days: daysSinceLastSession, tier: 'check-in' },
        '🔄 Session gap awareness: check-in'
      );
    }
    // 3-5 days - warm acknowledgment
    else if (daysSinceLastSession >= config.warmAcknowledgmentDays) {
      const guidance = getWarmAcknowledgmentGuidance(daysSinceLastSession);
      injections.push(
        createHintInjection('session_gap_warm', guidance, {
          category: 'session_awareness',
        })
      );
      log.debug(
        { userId, days: daysSinceLastSession, tier: 'warm' },
        '🔄 Session gap awareness: warm acknowledgment'
      );
    }

    return injections;
  } catch (error) {
    log.debug({ error: String(error) }, 'Session gap awareness failed');
    return [];
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

export const sessionGapAwarenessBuilder: ContextBuilder = {
  name: 'session-gap-awareness',
  description: 'Surfaces days since last session with warm reconnection guidance',
  priority: 30, // Early in context building for session awareness
  category: BuilderCategory.CONTEXT,
  build: buildSessionGapAwareness,
};

registerContextBuilder(sessionGapAwarenessBuilder);

export default sessionGapAwarenessBuilder;
