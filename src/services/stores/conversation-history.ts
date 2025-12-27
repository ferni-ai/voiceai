/**
 * Conversation History Service
 *
 * Stores and retrieves conversation session data.
 * Tracks insights, mood, topics, and highlights from each conversation.
 */

import { getEngagementStore } from '../engagement/engagement-store.js';
import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

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
   * Record a new conversation session.
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
      }
    }

    return id;
  }

  /**
   * Get conversation history for a user.
   */
  async getHistory(userId: string, limit = 50): Promise<ConversationHistoryData> {
    let sessions: ConversationSession[] = [];

    if (this.firestoreEnabled) {
      try {
        const store = await getEngagementStore();
        const storedSessions = await store.getConversationSessions(userId, limit);
        sessions = storedSessions.map((s) => ({
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
      } catch (error) {
        getLogger().error({ error, userId }, 'Failed to get conversation history');
      }
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
      totalSessions: sessions.length,
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
