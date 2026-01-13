/**
 * Conversation History Service
 *
 * Stores and retrieves conversation session data.
 * Tracks insights, mood, topics, and highlights from each conversation.
 */
export interface ConversationSession {
    id: string;
    date: string;
    personaId: string;
    personaName: string;
    duration: number;
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
declare class ConversationHistoryService {
    private firestoreEnabled;
    /**
     * Record a new conversation session.
     */
    recordSession(userId: string, session: Omit<ConversationSession, 'id' | 'date'>): Promise<string>;
    /**
     * Get conversation history for a user.
     */
    getHistory(userId: string, limit?: number): Promise<ConversationHistoryData>;
    /**
     * Get a specific session by ID.
     */
    getSession(userId: string, sessionId: string): Promise<ConversationSession | null>;
    /**
     * Add an insight to the most recent session.
     */
    addInsight(userId: string, insight: string): Promise<void>;
    /**
     * Add a highlight to the most recent session.
     */
    addHighlight(userId: string, highlight: string): Promise<void>;
    /**
     * Set the mood for the current session.
     */
    setSessionMood(userId: string, sessionId: string, mood: ConversationSession['mood'], energy?: ConversationSession['energy']): Promise<void>;
}
export declare function getConversationHistoryService(): ConversationHistoryService;
export default ConversationHistoryService;
//# sourceMappingURL=conversation-history.d.ts.map