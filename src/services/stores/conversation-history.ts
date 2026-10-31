/**
 * Conversation History Service
 *
 * Stores and retrieves conversation session data.
 * Tracks insights, mood, topics, and highlights from each conversation.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getDisplayName } from '../../personas/persona-ids.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { getEngagementStore } from '../engagement/engagement-store.js';
import { getStore } from '../../memory/store-factory.js';
import { getSessionsTogether, isCountedSession } from './sessions-together.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationSession {
  id: string;
  date: string;
  personaId: string;
  personaName: string;
  duration: number; // minutes
  messageCount: number;
  mood?: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy';
  energy?: 'high' | 'medium' | 'low';
  insights: string[];
  highlights: string[];
  topicsDiscussed: string[];
  transcript?: string;
}

export interface ConversationHistoryData {
  sessions: ConversationSession[];
  /** Every session together (sessions-together), not just the ones listed in `sessions`. */
  totalSessions: number;
  totalMinutes: number;
  favoritePersona?: string;
  insightCount: number;
}

interface StoredSession {
  id: string;
  date: string;
  personaId: string;
  personaName: string;
  duration: number;
  messageCount: number;
  mood?: string;
  energy?: string;
  insights: string[];
  highlights: string[];
  topicsDiscussed: string[];
}

// ============================================================================
// CONVERSATION HISTORY SERVICE
// ============================================================================

class ConversationHistoryService {
  private firestoreEnabled = true;

  /**
   * Record a new conversation session (the web app's hang-up). A first web call can come
   * before anything made the caller's user record, and engagement writes for a uid with
   * neither a record nor an engagement profile are dropped as an erased account's
   * (engagement-write-unless-erased.ts). So the record is made first, as user-migration
   * does: the caller is then a real new user and the session lands.
   */
  async recordSession(
    userId: string,
    session: Omit<ConversationSession, 'id' | 'date'>
  ): Promise<string> {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fullSession: StoredSession = {
      id,
      date: new Date().toISOString(),
      ...session,
    };

    if (this.firestoreEnabled) {
      try {
        await (await getStore()).getOrCreateProfile(userId);
        const store = await getEngagementStore();
        await store.addConversationSession(
          userId,
          fullSession as unknown as Record<string, unknown>
        );
        getLogger().info(
          { userId, sessionId: id, personaId: session.personaId },
          '📝 Conversation session recorded'
        );
      } catch (error) {
        getLogger().error({ error, userId }, 'Failed to record conversation session');
        // Rethrow so the caller can report the failure instead of claiming it saved.
        throw error;
      }
    }

    return id;
  }

  /**
   * Get conversation history for a user: every call the voice agent recorded
   * (bogle_users/{uid}/conversations, phone and web alike), enriched with the
   * summary the web app sends on hang-up. Throws when a store can't be read, so
   * the panel shows an error instead of "you've never talked".
   */
  async getHistory(userId: string, limit = 50): Promise<ConversationHistoryData> {
    let sessions: ConversationSession[] = [];
    let totalSessions = 0;

    if (this.firestoreEnabled) {
      const store = await getEngagementStore();
      const [calls, storedSessions, together] = await Promise.all([
        readAgentCalls(userId, limit),
        store.getConversationSessions(userId, limit),
        getSessionsTogether(userId, undefined, { fresh: true }), // rows are live: so is the total
      ]);
      totalSessions = together.count;
      const webSessions = storedSessions.map((s) => ({
        id: s.id as string,
        date: s.date as string,
        personaId: s.personaId as string,
        personaName: s.personaName as string,
        duration: s.duration as number,
        messageCount: s.messageCount as number,
        mood: s.mood as ConversationSession['mood'],
        energy: s.energy as ConversationSession['energy'],
        insights: (s.insights as string[]) || [],
        highlights: (s.highlights as string[]) || [],
        topicsDiscussed: (s.topicsDiscussed as string[]) || [],
      }));
      sessions = mergeWebSessions(calls, webSessions).slice(0, limit);
    }

    // Calculate aggregates
    const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
    const insightCount = sessions.reduce((sum, s) => sum + s.insights.length, 0);

    // Find favorite persona
    const personaCounts = new Map<string, number>();
    for (const session of sessions) {
      personaCounts.set(session.personaId, (personaCounts.get(session.personaId) || 0) + 1);
    }
    let favoritePersona: string | undefined;
    let maxCount = 0;
    for (const [personaId, count] of personaCounts) {
      if (count > maxCount) {
        maxCount = count;
        favoritePersona = personaId;
      }
    }

    return {
      sessions,
      totalSessions, // the total, not the length of this (latest-`limit`) page
      totalMinutes,
      favoritePersona,
      insightCount,
    };
  }

  /**
   * Get a specific session by ID.
   */
  async getSession(userId: string, sessionId: string): Promise<ConversationSession | null> {
    if (this.firestoreEnabled) {
      try {
        const store = await getEngagementStore();
        const session = await store.getConversationSession(userId, sessionId);
        if (session) {
          return {
            id: session.id as string,
            date: session.date as string,
            personaId: session.personaId as string,
            personaName: session.personaName as string,
            duration: session.duration as number,
            messageCount: session.messageCount as number,
            mood: session.mood as ConversationSession['mood'],
            energy: session.energy as ConversationSession['energy'],
            insights: (session.insights as string[]) || [],
            highlights: (session.highlights as string[]) || [],
            topicsDiscussed: (session.topicsDiscussed as string[]) || [],
          };
        }
      } catch (error) {
        getLogger().error({ error, userId, sessionId }, 'Failed to get session');
      }
    }
    return null;
  }

  /**
   * Add an insight to the most recent session.
   */
  async addInsight(userId: string, insight: string): Promise<void> {
    if (this.firestoreEnabled) {
      try {
        const store = await getEngagementStore();
        await store.addInsightToLatestSession(userId, insight);
        getLogger().info({ userId }, '💡 Insight added to session');
      } catch (error) {
        getLogger().error({ error, userId }, 'Failed to add insight');
      }
    }
  }

  /**
   * Add a highlight to the most recent session.
   */
  async addHighlight(userId: string, highlight: string): Promise<void> {
    if (this.firestoreEnabled) {
      try {
        const store = await getEngagementStore();
        await store.addHighlightToLatestSession(userId, highlight);
        getLogger().info({ userId }, '✨ Highlight added to session');
      } catch (error) {
        getLogger().error({ error, userId }, 'Failed to add highlight');
      }
    }
  }

  /**
   * Set the mood for the current session.
   */
  async setSessionMood(
    userId: string,
    sessionId: string,
    mood: ConversationSession['mood'],
    energy?: ConversationSession['energy']
  ): Promise<void> {
    if (this.firestoreEnabled) {
      try {
        const store = await getEngagementStore();
        await store.updateSessionMood(userId, sessionId, mood ?? 'partly-cloudy', energy);
        getLogger().info({ userId, mood, energy }, '🌤️ Session mood updated');
      } catch (error) {
        getLogger().error({ error, userId }, 'Failed to update session mood');
      }
    }
  }
}

// ============================================================================
// THE AGENT'S CALL RECORDS
// ============================================================================

/** A web hang-up summary belongs to the call that ended within this window. */
const HANGUP_MATCH_MS = 5 * 60_000;

interface AgentCall {
  session: ConversationSession;
  startMs: number;
  endMs?: number;
}

function toMillis(value: unknown): number | undefined {
  const date = (value as { toDate?: () => Date } | null)?.toDate?.() ?? value;
  const ms = date instanceof Date ? date.getTime() : Date.parse(String(date));
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Calls as the voice agent writes them (realtime-memory startConversation /
 * endConversation / markSummarized), newest first.
 */
async function readAgentCalls(userId: string, limit: number): Promise<AgentCall[]> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  const snapshot = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('conversations')
    .orderBy('startedAt', 'desc')
    .limit(limit)
    .get();

  const calls: AgentCall[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const startMs = toMillis(data.startedAt);
    // Only sessions together are listed, so the rows agree with the total in the header
    if (startMs === undefined || !isCountedSession(data)) continue;
    const endMs = toMillis(data.endedAt);
    const personaId = typeof data.personaId === 'string' ? data.personaId : 'ferni';
    const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
    calls.push({
      startMs,
      endMs,
      session: {
        id: doc.id,
        date: new Date(startMs).toISOString(),
        personaId,
        personaName: getDisplayName(personaId),
        duration: endMs !== undefined ? Math.max(0, Math.round((endMs - startMs) / 60_000)) : 0,
        messageCount: typeof data.turnCount === 'number' ? data.turnCount : 0,
        insights: [],
        highlights: summary ? [summary] : [],
        topicsDiscussed: [],
      },
    });
  }
  return calls;
}

/**
 * The web app records its own summary of a call on hang-up (POST
 * /api/conversations). Fold each one into the agent call it describes so a web
 * call shows once. A summary with no counted call is not listed: the rows are the
 * sessions together the header counts (a greeting-only call is not one).
 */
function mergeWebSessions(
  calls: AgentCall[],
  webSessions: ConversationSession[]
): ConversationSession[] {
  const taken = new Set<AgentCall>();
  for (const web of webSessions) {
    const hangUpMs = Date.parse(web.date);
    const call = calls.find((c) => {
      if (taken.has(c) || !Number.isFinite(hangUpMs)) return false;
      const endMs = c.endMs ?? c.startMs + web.duration * 60_000;
      return (
        c.startMs <= hangUpMs + HANGUP_MATCH_MS && Math.abs(endMs - hangUpMs) <= HANGUP_MATCH_MS
      );
    });
    if (!call) continue;
    taken.add(call);
    Object.assign(call.session, {
      personaName: web.personaName || call.session.personaName,
      duration: Math.max(call.session.duration, web.duration || 0),
      messageCount: Math.max(call.session.messageCount, web.messageCount || 0),
      mood: web.mood,
      energy: web.energy,
      insights: web.insights,
      highlights: [...call.session.highlights, ...web.highlights],
      topicsDiscussed: web.topicsDiscussed,
    });
  }
  return calls.map((c) => c.session).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: ConversationHistoryService | null = null;

export function getConversationHistoryService(): ConversationHistoryService {
  if (!instance) {
    instance = new ConversationHistoryService();
  }
  return instance;
}

export default ConversationHistoryService;
