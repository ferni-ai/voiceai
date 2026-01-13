/**
 * Conversation History Service
 *
 * Stores and retrieves conversation session data.
 * Tracks insights, mood, topics, and highlights from each conversation.
 */
import { getLogger } from '../../utils/safe-logger.js';
import { getEngagementStore } from '../engagement/engagement-store.js';
// ============================================================================
// CONVERSATION HISTORY SERVICE
// ============================================================================
class ConversationHistoryService {
    firestoreEnabled = true;
    /**
     * Record a new conversation session.
     */
    async recordSession(userId, session) {
        const id = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const fullSession = {
            id,
            date: new Date().toISOString(),
            ...session,
        };
        if (this.firestoreEnabled) {
            try {
                const store = await getEngagementStore();
                await store.addConversationSession(userId, fullSession);
                getLogger().info({ userId, sessionId: id, personaId: session.personaId }, '📝 Conversation session recorded');
            }
            catch (error) {
                getLogger().error({ error, userId }, 'Failed to record conversation session');
            }
        }
        return id;
    }
    /**
     * Get conversation history for a user.
     */
    async getHistory(userId, limit = 50) {
        let sessions = [];
        if (this.firestoreEnabled) {
            try {
                const store = await getEngagementStore();
                const storedSessions = await store.getConversationSessions(userId, limit);
                sessions = storedSessions.map((s) => ({
                    id: s.id,
                    date: s.date,
                    personaId: s.personaId,
                    personaName: s.personaName,
                    duration: s.duration,
                    messageCount: s.messageCount,
                    mood: s.mood,
                    energy: s.energy,
                    insights: s.insights || [],
                    highlights: s.highlights || [],
                    topicsDiscussed: s.topicsDiscussed || [],
                }));
            }
            catch (error) {
                getLogger().error({ error, userId }, 'Failed to get conversation history');
            }
        }
        // Calculate aggregates
        const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0);
        const insightCount = sessions.reduce((sum, s) => sum + s.insights.length, 0);
        // Find favorite persona
        const personaCounts = new Map();
        for (const session of sessions) {
            personaCounts.set(session.personaId, (personaCounts.get(session.personaId) || 0) + 1);
        }
        let favoritePersona;
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
    async getSession(userId, sessionId) {
        if (this.firestoreEnabled) {
            try {
                const store = await getEngagementStore();
                const session = await store.getConversationSession(userId, sessionId);
                if (session) {
                    return {
                        id: session.id,
                        date: session.date,
                        personaId: session.personaId,
                        personaName: session.personaName,
                        duration: session.duration,
                        messageCount: session.messageCount,
                        mood: session.mood,
                        energy: session.energy,
                        insights: session.insights || [],
                        highlights: session.highlights || [],
                        topicsDiscussed: session.topicsDiscussed || [],
                    };
                }
            }
            catch (error) {
                getLogger().error({ error, userId, sessionId }, 'Failed to get session');
            }
        }
        return null;
    }
    /**
     * Add an insight to the most recent session.
     */
    async addInsight(userId, insight) {
        if (this.firestoreEnabled) {
            try {
                const store = await getEngagementStore();
                await store.addInsightToLatestSession(userId, insight);
                getLogger().info({ userId }, '💡 Insight added to session');
            }
            catch (error) {
                getLogger().error({ error, userId }, 'Failed to add insight');
            }
        }
    }
    /**
     * Add a highlight to the most recent session.
     */
    async addHighlight(userId, highlight) {
        if (this.firestoreEnabled) {
            try {
                const store = await getEngagementStore();
                await store.addHighlightToLatestSession(userId, highlight);
                getLogger().info({ userId }, '✨ Highlight added to session');
            }
            catch (error) {
                getLogger().error({ error, userId }, 'Failed to add highlight');
            }
        }
    }
    /**
     * Set the mood for the current session.
     */
    async setSessionMood(userId, sessionId, mood, energy) {
        if (this.firestoreEnabled) {
            try {
                const store = await getEngagementStore();
                await store.updateSessionMood(userId, sessionId, mood ?? 'partly-cloudy', energy);
                getLogger().info({ userId, mood, energy }, '🌤️ Session mood updated');
            }
            catch (error) {
                getLogger().error({ error, userId }, 'Failed to update session mood');
            }
        }
    }
}
// ============================================================================
// SINGLETON EXPORT
// ============================================================================
let instance = null;
export function getConversationHistoryService() {
    if (!instance) {
        instance = new ConversationHistoryService();
    }
    return instance;
}
export default ConversationHistoryService;
//# sourceMappingURL=conversation-history.js.map